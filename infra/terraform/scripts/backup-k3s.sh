#!/usr/bin/env bash
set -euo pipefail
umask 077

readonly config_file="/etc/opsforge/backup.env"
if [[ ! -r "${config_file}" ]]; then
  echo "Missing ${config_file}." >&2
  exit 1
fi

# shellcheck disable=SC1090
source "${config_file}"
: "${AWS_REGION:?AWS_REGION is required}"
: "${BACKUP_BUCKET:?BACKUP_BUCKET is required}"
: "${BACKUP_KMS_KEY_ARN:?BACKUP_KMS_KEY_ARN is required}"
: "${K3S_DATA_DIR:?K3S_DATA_DIR is required}"
: "${LOCAL_SNAPSHOT_RETENTION:?LOCAL_SNAPSHOT_RETENTION is required}"

readonly work_dir="/run/opsforge-k3s-backup"
readonly snapshot_dir="${K3S_DATA_DIR}/server/db/snapshots"
readonly token_file="${K3S_DATA_DIR}/server/token"
timestamp="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
readonly timestamp
readonly snapshot_prefix="opsforge-recovery"

install -d -o root -g root -m 0700 "${work_dir}"
find "${work_dir}" -mindepth 1 -delete

k3s etcd-snapshot save --name "${snapshot_prefix}" --etcd-snapshot-compress
snapshot_path="$(find "${snapshot_dir}" -maxdepth 1 -type f -name "${snapshot_prefix}*" -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)"

if [[ -z "${snapshot_path}" || ! -s "${snapshot_path}" ]]; then
  echo "K3s did not create a usable etcd snapshot." >&2
  exit 1
fi
if [[ ! -s "${token_file}" ]]; then
  echo "K3s server token is missing; the snapshot is not independently restorable." >&2
  exit 1
fi

aws kms encrypt \
  --region "${AWS_REGION}" \
  --key-id "${BACKUP_KMS_KEY_ARN}" \
  --plaintext "fileb://${token_file}" \
  --encryption-context "purpose=opsforge-k3s-server-token" \
  --query CiphertextBlob \
  --output text | base64 --decode >"${work_dir}/server-token.kms"
chmod 0600 "${work_dir}/server-token.kms"
snapshot_digest="$(sha256sum "${snapshot_path}" | awk '{print $1}')"
token_ciphertext_digest="$(sha256sum "${work_dir}/server-token.kms" | awk '{print $1}')"
printf '%s  %s\n' "${snapshot_digest}" "$(basename "${snapshot_path}")" >"${work_dir}/etcd-snapshot.sha256"
printf '%s  %s\n' "${token_ciphertext_digest}" "server-token.kms" >"${work_dir}/server-token.kms.sha256"
jq --null-input \
  --arg created_at "${timestamp}" \
  --arg encryption_context "purpose=opsforge-k3s-server-token" \
  --arg key_arn "${BACKUP_KMS_KEY_ARN}" \
  --arg sha256 "${token_ciphertext_digest}" \
  '{schema: 1, created_at: $created_at, ciphertext: "server-token.kms", sha256: $sha256, kms_key_arn: $key_arn, encryption_context: $encryption_context}' \
  >"${work_dir}/server-token.manifest.json"

snapshot_key="k3s/etcd/${timestamp}/$(basename "${snapshot_path}")"
snapshot_checksum_key="k3s/etcd/${timestamp}/etcd-snapshot.sha256"
token_key="k3s/token/${timestamp}/server-token.kms"
token_checksum_key="k3s/token/${timestamp}/server-token.kms.sha256"
token_manifest_key="k3s/token/${timestamp}/server-token.manifest.json"

upload_recovery_object() {
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
  remote_metadata="$(aws s3api head-object --bucket "${BACKUP_BUCKET}" --key "${object_key}" --region "${AWS_REGION}" --checksum-mode ENABLED --query '[ContentLength,ServerSideEncryption,SSEKMSKeyId,ChecksumSHA256,Metadata.sha256]' --output text 2>/dev/null || true)"
  if [[ "${remote_metadata}" == "${expected_size}"$'\t'"aws:kms"$'\t'"${BACKUP_KMS_KEY_ARN}"$'\t'"${expected_checksum_b64}"$'\t'"${expected_checksum}" ]]; then
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

  remote_metadata="$(aws s3api head-object --bucket "${BACKUP_BUCKET}" --key "${object_key}" --region "${AWS_REGION}" --checksum-mode ENABLED --query '[ContentLength,ServerSideEncryption,SSEKMSKeyId,ChecksumSHA256,Metadata.sha256]' --output text 2>/dev/null || true)"
  if [[ "${remote_metadata}" != "${expected_size}"$'\t'"aws:kms"$'\t'"${BACKUP_KMS_KEY_ARN}"$'\t'"${expected_checksum_b64}"$'\t'"${expected_checksum}" ]]; then
    echo "Remote metadata verification failed for immutable s3://${BACKUP_BUCKET}/${object_key}; refusing to overwrite it." >&2
    return 1
  fi
}

upload_recovery_object "${snapshot_path}" "${snapshot_key}"
upload_recovery_object "${work_dir}/etcd-snapshot.sha256" "${snapshot_checksum_key}"
upload_recovery_object "${work_dir}/server-token.kms" "${token_key}"
upload_recovery_object "${work_dir}/server-token.kms.sha256" "${token_checksum_key}"
upload_recovery_object "${work_dir}/server-token.manifest.json" "${token_manifest_key}"

# On-demand snapshots are not automatically pruned by the server schedule.
k3s etcd-snapshot prune --name "${snapshot_prefix}" --snapshot-retention "${LOCAL_SNAPSHOT_RETENTION}"
find "${work_dir}" -mindepth 1 -delete
echo "Uploaded a restorable K3s snapshot to s3://${BACKUP_BUCKET}/k3s/etcd/${timestamp}/ and its token to k3s/token/${timestamp}/."
