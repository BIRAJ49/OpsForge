#!/usr/bin/env bash
set -euo pipefail
umask 077

readonly config_file="/etc/opsforge/backup.env"
readonly storage_root="/var/lib/rancher/k3s/storage"
readonly work_dir="/run/opsforge-postgres-upload"
readonly -a environments=(staging production)
readonly multipart_threshold_bytes=$((4 * 1024 * 1024 * 1024))
readonly multipart_part_size_bytes=$((64 * 1024 * 1024))

if [[ ! -r "${config_file}" ]]; then
  echo "Missing ${config_file}." >&2
  exit 1
fi

# shellcheck disable=SC1090
source "${config_file}"
: "${AWS_REGION:?AWS_REGION is required}"
: "${BACKUP_BUCKET:?BACKUP_BUCKET is required}"
: "${BACKUP_KMS_KEY_ARN:?BACKUP_KMS_KEY_ARN is required}"
: "${POSTGRES_BACKUP_IMAGE_REVISION:?POSTGRES_BACKUP_IMAGE_REVISION is required}"

install -d -o root -g root -m 0700 "${work_dir}"
bundle_failures=0

remote_object_matches() {
  local object_key="$1"
  local expected_size="$2"
  local expected_checksum_b64="$3"
  local expected_checksum="$4"
  local remote_metadata

  remote_metadata="$(aws s3api head-object --bucket "${BACKUP_BUCKET}" --key "${object_key}" --region "${AWS_REGION}" --checksum-mode ENABLED --query '[ContentLength,ServerSideEncryption,SSEKMSKeyId,ChecksumSHA256,Metadata.sha256]' --output text 2>/dev/null || true)"
  [[ "${remote_metadata}" == "${expected_size}"$'\t'"aws:kms"$'\t'"${BACKUP_KMS_KEY_ARN}"$'\t'"${expected_checksum_b64}"$'\t'"${expected_checksum}" ]]
}

abort_multipart_upload() {
  local object_key="$1"
  local upload_id="$2"

  aws s3api abort-multipart-upload \
    --bucket "${BACKUP_BUCKET}" \
    --key "${object_key}" \
    --upload-id "${upload_id}" \
    --region "${AWS_REGION}" >/dev/null 2>&1 || true
}

upload_multipart_file() {
  local source_path="$1"
  local object_key="$2"
  local expected_checksum="$3"
  local expected_size="$4"
  local checksum_parts_file="${work_dir}/multipart-checksums.bin"
  local part_file="${work_dir}/multipart-part.bin"
  local parts_file="${work_dir}/multipart-parts.json"
  local parts_file_next="${work_dir}/multipart-parts.next.json"
  local composite_checksum_b64
  local complete_result
  local expected_checksum_b64
  local part_checksum_b64
  local part_count
  local part_number
  local part_response
  local returned_checksum
  local returned_etag
  local upload_id

  part_count=$(((expected_size + multipart_part_size_bytes - 1) / multipart_part_size_bytes))
  if ((part_count > 10000)); then
    echo "Backup requires ${part_count} S3 parts, exceeding the 10,000-part limit." >&2
    return 1
  fi

  : >"${checksum_parts_file}"
  for ((part_number = 1; part_number <= part_count; part_number++)); do
    if ! dd if="${source_path}" bs="${multipart_part_size_bytes}" skip="$((part_number - 1))" count=1 status=none |
      openssl dgst -sha256 -binary >>"${checksum_parts_file}"; then
      echo "Could not calculate multipart checksum ${part_number}/${part_count}." >&2
      return 1
    fi
  done
  composite_checksum_b64="$(openssl dgst -sha256 -binary "${checksum_parts_file}" | base64 -w0)"
  expected_checksum_b64="${composite_checksum_b64}-${part_count}"

  if remote_object_matches "${object_key}" "${expected_size}" "${expected_checksum_b64}" "${expected_checksum}"; then
    find "${work_dir}" -maxdepth 1 -type f -name 'multipart-*' -delete
    return 0
  fi

  if ! upload_id="$(aws s3api create-multipart-upload \
    --bucket "${BACKUP_BUCKET}" \
    --key "${object_key}" \
    --region "${AWS_REGION}" \
    --server-side-encryption aws:kms \
    --ssekms-key-id "${BACKUP_KMS_KEY_ARN}" \
    --checksum-algorithm SHA256 \
    --checksum-type COMPOSITE \
    --metadata "sha256=${expected_checksum}" \
    --query UploadId \
    --output text)"; then
    echo "Could not create multipart upload for s3://${BACKUP_BUCKET}/${object_key}." >&2
    return 1
  fi

  printf '%s\n' '{"Parts":[]}' >"${parts_file}"
  for ((part_number = 1; part_number <= part_count; part_number++)); do
    if ! dd if="${source_path}" of="${part_file}" bs="${multipart_part_size_bytes}" skip="$((part_number - 1))" count=1 status=none; then
      abort_multipart_upload "${object_key}" "${upload_id}"
      return 1
    fi
    part_checksum_b64="$(openssl dgst -sha256 -binary "${part_file}" | base64 -w0)"
    if ! part_response="$(aws s3api upload-part \
      --bucket "${BACKUP_BUCKET}" \
      --key "${object_key}" \
      --part-number "${part_number}" \
      --body "${part_file}" \
      --upload-id "${upload_id}" \
      --region "${AWS_REGION}" \
      --checksum-algorithm SHA256 \
      --checksum-sha256 "${part_checksum_b64}" \
      --output json)"; then
      abort_multipart_upload "${object_key}" "${upload_id}"
      return 1
    fi
    returned_checksum="$(jq --raw-output '.ChecksumSHA256 // empty' <<<"${part_response}")"
    returned_etag="$(jq --raw-output '.ETag // empty' <<<"${part_response}")"
    if [[ "${returned_checksum}" != "${part_checksum_b64}" || -z "${returned_etag}" ]]; then
      echo "S3 part checksum verification failed for ${object_key} part ${part_number}." >&2
      abort_multipart_upload "${object_key}" "${upload_id}"
      return 1
    fi
    jq \
      --arg etag "${returned_etag}" \
      --arg checksum "${returned_checksum}" \
      --argjson part_number "${part_number}" \
      '.Parts += [{ETag: $etag, PartNumber: $part_number, ChecksumSHA256: $checksum}]' \
      "${parts_file}" >"${parts_file_next}"
    mv "${parts_file_next}" "${parts_file}"
  done

  if complete_result="$(aws s3api complete-multipart-upload \
    --bucket "${BACKUP_BUCKET}" \
    --key "${object_key}" \
    --upload-id "${upload_id}" \
    --multipart-upload "file://${parts_file}" \
    --region "${AWS_REGION}" \
    --if-none-match '*' \
    --checksum-sha256 "${composite_checksum_b64}" \
    --checksum-type COMPOSITE \
    --mpu-object-size "${expected_size}" 2>&1)"; then
    :
  elif [[ "${complete_result}" == *PreconditionFailed* || "${complete_result}" == *"412"* ]]; then
    abort_multipart_upload "${object_key}" "${upload_id}"
  else
    echo "S3 multipart completion failed for s3://${BACKUP_BUCKET}/${object_key}: ${complete_result}" >&2
    abort_multipart_upload "${object_key}" "${upload_id}"
    return 1
  fi

  find "${work_dir}" -maxdepth 1 -type f -name 'multipart-*' -delete
  if ! remote_object_matches "${object_key}" "${expected_size}" "${expected_checksum_b64}" "${expected_checksum}"; then
    echo "Remote metadata verification failed for immutable multipart object s3://${BACKUP_BUCKET}/${object_key}; refusing to overwrite it." >&2
    return 1
  fi
}

upload_file() {
  local source_path="$1"
  local object_key="$2"
  local expected_checksum
  local expected_checksum_b64
  local expected_size
  local put_result
  local remote_metadata

  expected_checksum="$(sha256sum "${source_path}" | awk '{print $1}')"
  expected_checksum_b64="$(openssl dgst -sha256 -binary "${source_path}" | base64 -w0)"
  expected_size="$(stat --format='%s' "${source_path}")"
  if ((expected_size > multipart_threshold_bytes)); then
    upload_multipart_file "${source_path}" "${object_key}" "${expected_checksum}" "${expected_size}"
    return
  fi

  if remote_object_matches "${object_key}" "${expected_size}" "${expected_checksum_b64}" "${expected_checksum}"; then
    return 0
  fi

  if put_result="$(aws s3api put-object \
    --bucket "${BACKUP_BUCKET}" \
    --key "${object_key}" \
    --body "${source_path}" \
    --if-none-match '*' \
    --region "${AWS_REGION}" \
    --server-side-encryption aws:kms \
    --ssekms-key-id "${BACKUP_KMS_KEY_ARN}" \
    --checksum-algorithm SHA256 \
    --metadata "sha256=${expected_checksum}" 2>&1)"; then
    :
  elif [[ "${put_result}" != *PreconditionFailed* && "${put_result}" != *"412"* ]]; then
    echo "S3 upload failed for s3://${BACKUP_BUCKET}/${object_key}: ${put_result}" >&2
    return 1
  fi

  if ! remote_object_matches "${object_key}" "${expected_size}" "${expected_checksum_b64}" "${expected_checksum}"; then
    echo "Remote metadata verification failed for immutable s3://${BACKUP_BUCKET}/${object_key}; refusing to overwrite it." >&2
    return 1
  fi
}

for environment in "${environments[@]}"; do
  namespace="opsforge-${environment}"
  pvc_name="postgres-backups"

  pv_name="$(k3s kubectl --namespace "${namespace}" get pvc "${pvc_name}" --output jsonpath='{.spec.volumeName}' 2>/dev/null || true)"
  [[ -n "${pv_name}" ]] || continue

  pv_path="$(k3s kubectl get pv "${pv_name}" --output jsonpath='{.spec.hostPath.path}' 2>/dev/null || true)"
  [[ -n "${pv_path}" ]] || continue
  resolved_path="$(realpath -e "${pv_path}" 2>/dev/null || true)"
  expected_suffix="_opsforge-${environment}_postgres-backups"

  if [[ -z "${resolved_path}" || "${resolved_path}" != "${storage_root}/"* || "$(basename "${resolved_path}")" != *"${expected_suffix}" ]]; then
    echo "Refusing unexpected ${namespace}/${pvc_name} hostPath: ${pv_path}." >&2
    exit 1
  fi

  ready_dir="${resolved_path}/ready"
  [[ -d "${ready_dir}" ]] || continue

  while IFS= read -r ready_marker; do
    stem="$(basename "${ready_marker}" .ready)"
    if [[ ! "${stem}" =~ ^opsforge-[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}Z$ ]]; then
      echo "Ignoring malformed ready marker ${ready_marker}." >&2
      bundle_failures=1
      continue
    fi

    dump_file="${ready_dir}/${stem}.dump"
    checksum_file="${ready_dir}/${stem}.sha256"
    manifest_file="${ready_dir}/${stem}.manifest.json"
    uploaded_marker="${ready_dir}/${stem}.uploaded"
    [[ -e "${uploaded_marker}" ]] && continue

    if [[ ! -s "${dump_file}" || ! -s "${checksum_file}" || ! -s "${manifest_file}" ]]; then
      echo "Incomplete ready bundle for ${namespace}/${stem}." >&2
      bundle_failures=1
      continue
    fi

    if ! jq --exit-status 'type == "object"' "${manifest_file}" >/dev/null 2>&1; then
      echo "Invalid manifest JSON for ${namespace}/${stem}." >&2
      bundle_failures=1
      continue
    fi
    expected_digest="$(awk 'NF >= 1 { print $1; exit }' "${checksum_file}")"
    if [[ ! "${expected_digest}" =~ ^[0-9a-f]{64}$ ]]; then
      echo "Invalid SHA-256 file for ${namespace}/${stem}." >&2
      bundle_failures=1
      continue
    fi
    actual_digest="$(sha256sum "${dump_file}" | awk '{print $1}')"
    if [[ "${actual_digest}" != "${expected_digest}" ]]; then
      echo "Checksum mismatch for ${namespace}/${stem}." >&2
      bundle_failures=1
      continue
    fi

    ready_digest="$(awk 'NF >= 1 { print $1; exit }' "${ready_marker}")"
    manifest_environment="$(jq --raw-output '.environment // empty' "${manifest_file}")"
    manifest_created_at="$(jq --raw-output '.created_at // empty' "${manifest_file}")"
    manifest_database="$(jq --raw-output '.database // empty' "${manifest_file}")"
    manifest_format="$(jq --raw-output '.format // empty' "${manifest_file}")"
    manifest_postgres_version="$(jq --raw-output '.postgres_version // empty' "${manifest_file}")"
    manifest_image_revision="$(jq --raw-output '.image_revision // empty' "${manifest_file}")"
    manifest_sha256="$(jq --raw-output '.sha256 // empty' "${manifest_file}")"
    manifest_size="$(jq --raw-output '.size_bytes // empty' "${manifest_file}")"
    manifest_schema="$(jq --raw-output '.schema // empty' "${manifest_file}")"
    expected_created_at="${stem#opsforge-}"
    dump_size="$(stat --format='%s' "${dump_file}")"

    if [[ "${ready_digest}" != "${actual_digest}" ||
      "${manifest_schema}" != "1" ||
      "${manifest_environment}" != "${environment}" ||
      -z "${manifest_database}" ||
      "${manifest_created_at}" != "${expected_created_at}" ||
      "${manifest_format}" != "postgres-custom" ||
      ! "${manifest_database}" =~ ^[A-Za-z0-9_-]+$ ||
      ! "${manifest_postgres_version}" =~ ^[0-9]+\.[0-9]+([.][0-9]+)?$ ||
      "${manifest_image_revision}" != "${POSTGRES_BACKUP_IMAGE_REVISION}" ||
      "${manifest_sha256}" != "${actual_digest}" ||
      "${manifest_size}" != "${dump_size}" ]]; then
      echo "Manifest/ready validation failed for ${namespace}/${stem}." >&2
      bundle_failures=1
      continue
    fi

    object_prefix="postgres/${environment}/${stem}"
    if ! upload_file "${dump_file}" "${object_prefix}/${stem}.dump" ||
      ! upload_file "${checksum_file}" "${object_prefix}/${stem}.sha256" ||
      ! upload_file "${manifest_file}" "${object_prefix}/${stem}.manifest.json"; then
      echo "Upload failed for ${namespace}/${stem}; later bundles will still be attempted." >&2
      bundle_failures=1
      continue
    fi
    printf '%s\n' "uploaded_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"${uploaded_marker}"
    chmod 0600 "${uploaded_marker}"
    echo "Uploaded verified PostgreSQL backup bundle to s3://${BACKUP_BUCKET}/${object_prefix}/."
  done < <(find "${ready_dir}" -maxdepth 1 -type f -name '*.ready' -print | sort)
done

if ((bundle_failures != 0)); then
  echo "One or more PostgreSQL backup bundles failed validation or upload." >&2
  exit 1
fi
