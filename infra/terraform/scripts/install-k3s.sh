#!/usr/bin/env bash
set -euo pipefail

exec > >(tee -a /var/log/opsforge-k3s-bootstrap.log) 2>&1
umask 027

wait_for_k3s_ready() {
  local attempts=0

  until k3s kubectl get nodes --no-headers 2>/dev/null | grep -q .; do
    attempts=$((attempts + 1))
    if ((attempts >= 120)); then
      echo "K3s API did not become available within 10 minutes." >&2
      return 1
    fi
    sleep 5
  done
  k3s kubectl wait --for=condition=Ready node --all --timeout=300s
}

secrets_encryption_status() {
  k3s secrets-encrypt status 2>&1
}

assert_secrets_encryption_start() {
  local status="$1"

  grep -qF "Encryption Status: Disabled" <<<"${status}" &&
    grep -qF "Current Rotation Stage: start" <<<"${status}" &&
    grep -qF "Server Encryption Hashes: All hashes match" <<<"${status}"
}

assert_secrets_encryption_finished() {
  local status="$1"

  grep -qF "Encryption Status: Enabled" <<<"${status}" &&
    grep -qF "Current Rotation Stage: reencrypt_finished" <<<"${status}" &&
    grep -qF "Server Encryption Hashes: All hashes match" <<<"${status}"
}

wait_for_secrets_encryption_finished() {
  local attempts=0
  local status=""

  while ((attempts < 120)); do
    status="$(secrets_encryption_status || true)"
    if assert_secrets_encryption_finished "${status}"; then
      return 0
    fi
    attempts=$((attempts + 1))
    sleep 5
  done

  echo "K3s secrets encryption did not reach the required final state within 10 minutes." >&2
  printf '%s\n' "${status}" >&2
  return 1
}

: "${OPSFORGE_AWS_REGION:?OPSFORGE_AWS_REGION is required}"
: "${OPSFORGE_AWS_CLI_SHA256:?OPSFORGE_AWS_CLI_SHA256 is required}"
: "${OPSFORGE_AWS_CLI_VERSION:?OPSFORGE_AWS_CLI_VERSION is required}"
: "${OPSFORGE_ALERT_TOPIC_ARN:?OPSFORGE_ALERT_TOPIC_ARN is required}"
: "${OPSFORGE_BACKUP_BUCKET:?OPSFORGE_BACKUP_BUCKET is required}"
: "${OPSFORGE_BACKUP_KMS_KEY_ARN:?OPSFORGE_BACKUP_KMS_KEY_ARN is required}"
: "${OPSFORGE_BACKUP_SCRIPT_B64_GZ:?OPSFORGE_BACKUP_SCRIPT_B64_GZ is required}"
: "${OPSFORGE_DATA_MOUNT:?OPSFORGE_DATA_MOUNT is required}"
: "${OPSFORGE_DATA_VOLUME_ID:?OPSFORGE_DATA_VOLUME_ID is required}"
: "${OPSFORGE_K3S_SHA256:?OPSFORGE_K3S_SHA256 is required}"
: "${OPSFORGE_K3S_SNAPSHOT_RETENTION:?OPSFORGE_K3S_SNAPSHOT_RETENTION is required}"
: "${OPSFORGE_K3S_VERSION:?OPSFORGE_K3S_VERSION is required}"
: "${OPSFORGE_POSTGRES_UPLOAD_SCRIPT_B64_GZ:?OPSFORGE_POSTGRES_UPLOAD_SCRIPT_B64_GZ is required}"
: "${OPSFORGE_POSTGRES_BACKUP_IMAGE_REVISION:?OPSFORGE_POSTGRES_BACKUP_IMAGE_REVISION is required}"

if [[ "$(uname -m)" != "x86_64" ]]; then
  echo "This bootstrap is checksum-pinned to the amd64 K3s release." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install --yes --no-install-recommends ca-certificates curl e2fsprogs jq openssl rsync unzip

aws_cli_install_work="$(mktemp -d)"
aws_cli_zip="${aws_cli_install_work}/awscliv2.zip"
curl --fail --location --proto '=https' --tlsv1.2 \
  "https://awscli.amazonaws.com/awscli-exe-linux-x86_64-${OPSFORGE_AWS_CLI_VERSION}.zip" \
  --output "${aws_cli_zip}"
printf '%s  %s\n' "${OPSFORGE_AWS_CLI_SHA256}" "${aws_cli_zip}" | sha256sum --check --strict -
unzip -q "${aws_cli_zip}" -d "${aws_cli_install_work}"
if [[ -d /usr/local/aws-cli ]]; then
  "${aws_cli_install_work}/aws/install" --bin-dir /usr/local/bin --install-dir /usr/local/aws-cli --update
else
  "${aws_cli_install_work}/aws/install" --bin-dir /usr/local/bin --install-dir /usr/local/aws-cli
fi
rm -rf "${aws_cli_install_work}"

aws_cli_reported_version="$(aws --version 2>&1)"
if [[ "${aws_cli_reported_version}" != "aws-cli/${OPSFORGE_AWS_CLI_VERSION} "* ]]; then
  echo "Installed AWS CLI version does not match ${OPSFORGE_AWS_CLI_VERSION}: ${aws_cli_reported_version}" >&2
  exit 1
fi
if ! AWS_PAGER="" aws s3api put-object --generate-cli-skeleton input | jq --exit-status 'has("IfNoneMatch")' >/dev/null; then
  echo "Pinned AWS CLI does not expose s3api put-object --if-none-match." >&2
  exit 1
fi
if ! AWS_PAGER="" aws s3api complete-multipart-upload --generate-cli-skeleton input |
  jq --exit-status 'has("IfNoneMatch") and has("ChecksumSHA256") and has("ChecksumType") and has("MpuObjectSize")' >/dev/null; then
  echo "Pinned AWS CLI does not expose conditional, checksummed multipart completion." >&2
  exit 1
fi
if ! AWS_PAGER="" aws s3api create-multipart-upload --generate-cli-skeleton input |
  jq --exit-status 'has("ChecksumAlgorithm") and has("ChecksumType")' >/dev/null; then
  echo "Pinned AWS CLI does not expose checksummed multipart creation." >&2
  exit 1
fi

volume_id_without_dash="${OPSFORGE_DATA_VOLUME_ID//-/}"
stable_device="/dev/disk/by-id/nvme-Amazon_Elastic_Block_Store_${volume_id_without_dash}"
data_device=""

for _ in $(seq 1 120); do
  if [[ -b "${stable_device}" ]]; then
    data_device="$(readlink -f "${stable_device}")"
    break
  fi
  sleep 5
done

if [[ -z "${data_device}" ]]; then
  echo "The retained K3s volume ${OPSFORGE_DATA_VOLUME_ID} did not appear within 10 minutes." >&2
  exit 1
fi

root_partition="$(findmnt --noheadings --output SOURCE / | xargs readlink -f)"
root_parent="$(lsblk --noheadings --output PKNAME "${root_partition}" | xargs)"
root_device="${root_partition}"
if [[ -n "${root_parent}" ]]; then
  root_device="/dev/${root_parent}"
fi
if [[ "${data_device}" == "${root_device}" || "${data_device}" == "${root_partition}" ]]; then
  echo "Refusing to format or mount root device ${root_device}." >&2
  exit 1
fi

filesystem_type="$(blkid -o value -s TYPE "${data_device}" || true)"
if [[ -z "${filesystem_type}" ]]; then
  mkfs.ext4 -F -L OPSFORGE_K3S_DATA "${data_device}"
elif [[ "${filesystem_type}" != "ext4" ]]; then
  echo "Expected a blank or ext4 K3s data volume; found ${filesystem_type}." >&2
  exit 1
fi

mkdir -p "${OPSFORGE_DATA_MOUNT}"
if ! findmnt --mountpoint "${OPSFORGE_DATA_MOUNT}" >/dev/null 2>&1; then
  if find "${OPSFORGE_DATA_MOUNT}" -mindepth 1 -maxdepth 1 -print -quit | grep -q .; then
    echo "${OPSFORGE_DATA_MOUNT} already contains root-disk data. Run migrate-k3s-data.sh; bootstrap will not hide it." >&2
    exit 1
  fi

  data_uuid="$(blkid -o value -s UUID "${data_device}")"
  fstab_entry="UUID=${data_uuid} ${OPSFORGE_DATA_MOUNT} ext4 defaults,nofail,x-systemd.device-timeout=120 0 2"
  grep -qF "UUID=${data_uuid} " /etc/fstab || printf '%s\n' "${fstab_entry}" >> /etc/fstab
  mount "${OPSFORGE_DATA_MOUNT}"
fi

mounted_device="$(findmnt --noheadings --output SOURCE --target "${OPSFORGE_DATA_MOUNT}" | xargs readlink -f)"
if [[ "${mounted_device}" != "${data_device}" ]]; then
  echo "${OPSFORGE_DATA_MOUNT} is mounted from ${mounted_device}, expected ${data_device}." >&2
  exit 1
fi

existing_cluster=false
if [[ -s "${OPSFORGE_DATA_MOUNT}/server/token" || -s "${OPSFORGE_DATA_MOUNT}/server/db/state.db" || -d "${OPSFORGE_DATA_MOUNT}/server/db/etcd" ]]; then
  existing_cluster=true
  if [[ ! -s "${OPSFORGE_DATA_MOUNT}/.opsforge-k3s-data-migrated" ]]; then
    echo "Existing K3s data lacks the migration receipt; refusing an in-place datastore/security conversion." >&2
    exit 1
  fi

  if ! systemctl is-active --quiet k3s.service; then
    systemctl start k3s.service
  fi
  wait_for_k3s_ready

  preconfigure_timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  if [[ -s "${OPSFORGE_DATA_MOUNT}/server/db/state.db" && ! -d "${OPSFORGE_DATA_MOUNT}/server/db/etcd" ]]; then
    systemctl stop k3s.service
    sqlite_backup_dir="${OPSFORGE_DATA_MOUNT}/server/db.pre-secrets-${preconfigure_timestamp}"
    cp -a "${OPSFORGE_DATA_MOUNT}/server/db" "${sqlite_backup_dir}"
    systemctl start k3s.service
    wait_for_k3s_ready
  else
    k3s etcd-snapshot save --name "pre-secrets-encryption-${preconfigure_timestamp}" --etcd-snapshot-compress
  fi
fi

install_dir="$(mktemp -d)"
trap 'rm -rf "${install_dir}"' EXIT
k3s_version_url="${OPSFORGE_K3S_VERSION//+/%2B}"
curl --fail --location --proto '=https' --tlsv1.2 \
  "https://github.com/k3s-io/k3s/releases/download/${k3s_version_url}/k3s" \
  --output "${install_dir}/k3s"
printf '%s  %s\n' "${OPSFORGE_K3S_SHA256}" "${install_dir}/k3s" | sha256sum --check --strict -
install -o root -g root -m 0755 "${install_dir}/k3s" /usr/local/bin/k3s
ln -sfn /usr/local/bin/k3s /usr/local/bin/kubectl
ln -sfn /usr/local/bin/k3s /usr/local/bin/crictl
ln -sfn /usr/local/bin/k3s /usr/local/bin/ctr

encryption_mode="fresh"
if [[ "${existing_cluster}" == "true" ]]; then
  encryption_status_before="$(k3s secrets-encrypt status)"
  if grep -qF "Encryption Status: Disabled, no configuration file found" <<<"${encryption_status_before}"; then
    encryption_mode="disabled_unconfigured"
  elif grep -qF "Encryption Status: Disabled" <<<"${encryption_status_before}" && \
    grep -qF "Current Rotation Stage: start" <<<"${encryption_status_before}"; then
    encryption_mode="disabled_start"
  elif grep -qF "Encryption Status: Enabled" <<<"${encryption_status_before}"; then
    encryption_mode="enabled"
  else
    echo "Unrecognized existing K3s secrets-encryption state; refusing to continue." >&2
    printf '%s\n' "${encryption_status_before}" >&2
    exit 1
  fi
  systemctl stop k3s.service
fi

install -d -o root -g root -m 0755 /etc/rancher/k3s /etc/opsforge
cat >/etc/rancher/k3s/config.yaml <<EOF
cluster-init: true
data-dir: ${OPSFORGE_DATA_MOUNT}
disable:
  - traefik
write-kubeconfig-mode: "0600"
cluster-cidr: 10.244.0.0/16
service-cidr: 10.96.0.0/12
cluster-dns: 10.96.0.10
etcd-snapshot-compress: true
etcd-disable-snapshots: true
EOF

if [[ "${encryption_mode}" != "disabled_unconfigured" ]]; then
  printf '%s\n' 'secrets-encryption: true' >>/etc/rancher/k3s/config.yaml
fi

cat >/etc/systemd/system/k3s.service <<'EOF'
[Unit]
Description=Lightweight Kubernetes
Documentation=https://docs.k3s.io
Wants=network-online.target
After=network-online.target
RequiresMountsFor=/var/lib/rancher/k3s

[Install]
WantedBy=multi-user.target

[Service]
Type=notify
EnvironmentFile=-/etc/default/%N
EnvironmentFile=-/etc/sysconfig/%N
KillMode=process
Delegate=yes
LimitNOFILE=1048576
LimitNPROC=infinity
LimitCORE=infinity
TasksMax=infinity
TimeoutStartSec=0
Restart=always
RestartSec=5s
ExecStart=/usr/local/bin/k3s server --config /etc/rancher/k3s/config.yaml
EOF

printf '%s\n' "${OPSFORGE_BACKUP_SCRIPT_B64_GZ}" | base64 --decode | gzip --decompress >/usr/local/sbin/opsforge-k3s-backup
chown root:root /usr/local/sbin/opsforge-k3s-backup
chmod 0700 /usr/local/sbin/opsforge-k3s-backup
printf '%s\n' "${OPSFORGE_POSTGRES_UPLOAD_SCRIPT_B64_GZ}" | base64 --decode | gzip --decompress >/usr/local/sbin/opsforge-postgres-backup-upload
chown root:root /usr/local/sbin/opsforge-postgres-backup-upload
chmod 0700 /usr/local/sbin/opsforge-postgres-backup-upload

cat >/etc/opsforge/backup.env <<EOF
AWS_REGION=${OPSFORGE_AWS_REGION}
ALERT_TOPIC_ARN=${OPSFORGE_ALERT_TOPIC_ARN}
BACKUP_BUCKET=${OPSFORGE_BACKUP_BUCKET}
BACKUP_KMS_KEY_ARN=${OPSFORGE_BACKUP_KMS_KEY_ARN}
K3S_DATA_DIR=${OPSFORGE_DATA_MOUNT}
LOCAL_SNAPSHOT_RETENTION=${OPSFORGE_K3S_SNAPSHOT_RETENTION}
POSTGRES_BACKUP_IMAGE_REVISION=${OPSFORGE_POSTGRES_BACKUP_IMAGE_REVISION}
EOF

cat >/etc/systemd/system/opsforge-postgres-backup-upload.service <<'EOF'
[Unit]
Description=Verify and upload ready OpsForge PostgreSQL dumps to S3
Requires=k3s.service
After=k3s.service network-online.target
OnFailure=opsforge-backup-failure-notify@%n.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/opsforge-postgres-backup-upload
User=root
Group=root
PrivateTmp=true
NoNewPrivileges=true
ProtectHome=true
ProtectSystem=strict
RuntimeDirectory=opsforge-postgres-upload
RuntimeDirectoryMode=0700
ReadWritePaths=/var/lib/rancher/k3s/storage /run/opsforge-postgres-upload
EOF

cat >/etc/systemd/system/opsforge-postgres-backup-upload.timer <<'EOF'
[Unit]
Description=Upload completed OpsForge PostgreSQL dumps every 15 minutes

[Timer]
OnBootSec=10m
OnUnitActiveSec=15m
RandomizedDelaySec=2m
Persistent=true
Unit=opsforge-postgres-backup-upload.service

[Install]
WantedBy=timers.target
EOF
chown root:root /etc/opsforge/backup.env
chmod 0600 /etc/opsforge/backup.env

cat >/etc/systemd/system/opsforge-k3s-backup.service <<'EOF'
[Unit]
Description=Back up K3s embedded etcd and server token to S3
Requires=k3s.service
After=k3s.service network-online.target
OnFailure=opsforge-backup-failure-notify@%n.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/opsforge-k3s-backup
User=root
Group=root
PrivateTmp=true
NoNewPrivileges=true
ProtectHome=true
ProtectSystem=strict
RuntimeDirectory=opsforge-k3s-backup
RuntimeDirectoryMode=0700
ReadWritePaths=/var/lib/rancher/k3s/server/db/snapshots /run/opsforge-k3s-backup
EOF

cat >/etc/systemd/system/opsforge-k3s-backup.timer <<'EOF'
[Unit]
Description=Run the OpsForge K3s recovery backup every six hours

[Timer]
OnCalendar=*-*-* 01,07,13,19:15:00 UTC
RandomizedDelaySec=15m
Persistent=true
Unit=opsforge-k3s-backup.service

[Install]
WantedBy=timers.target
EOF

cat >/usr/local/sbin/opsforge-backup-failure-notify <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

readonly config_file="/etc/opsforge/backup.env"
readonly failed_unit="${1:?failed systemd unit is required}"
case "${failed_unit}" in
  opsforge-k3s-backup.service | opsforge-postgres-backup-upload.service) ;;
  *)
    echo "Refusing unexpected failure-notification unit ${failed_unit}." >&2
    exit 64
    ;;
esac

# shellcheck disable=SC1090
source "${config_file}"
: "${ALERT_TOPIC_ARN:?ALERT_TOPIC_ARN is required}"
: "${AWS_REGION:?AWS_REGION is required}"

occurred_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
aws sns publish \
  --region "${AWS_REGION}" \
  --topic-arn "${ALERT_TOPIC_ARN}" \
  --subject "OpsForge host backup failure" \
  --message "${failed_unit} failed on $(hostname) at ${occurred_at}. Inspect it through SSM; no logs or secrets are included in this alert." >/dev/null
EOF
chown root:root /usr/local/sbin/opsforge-backup-failure-notify
chmod 0700 /usr/local/sbin/opsforge-backup-failure-notify

cat >/etc/systemd/system/opsforge-backup-failure-notify@.service <<'EOF'
[Unit]
Description=Publish an off-node alert for failed OpsForge backup unit %i
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
EnvironmentFile=/etc/opsforge/backup.env
Environment=HOME=/run/opsforge-backup-failure
ExecStart=/usr/local/sbin/opsforge-backup-failure-notify %i
User=root
Group=root
NoNewPrivileges=true
PrivateTmp=true
ProtectControlGroups=true
ProtectHome=true
ProtectKernelModules=true
ProtectKernelTunables=true
ProtectSystem=strict
RuntimeDirectory=opsforge-backup-failure
RuntimeDirectoryMode=0700
ReadWritePaths=/run/opsforge-backup-failure
EOF

cat >/usr/local/sbin/opsforge-k3s-storage-attest <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

: "${OPSFORGE_DATA_MOUNT:?OPSFORGE_DATA_MOUNT is required}"
: "${OPSFORGE_DATA_VOLUME_ID:?OPSFORGE_DATA_VOLUME_ID is required}"

volume_id_without_dash="${OPSFORGE_DATA_VOLUME_ID//-/}"
stable_device="/dev/disk/by-id/nvme-Amazon_Elastic_Block_Store_${volume_id_without_dash}"
if [[ ! -b "${stable_device}" ]]; then
  echo "Expected retained volume device ${stable_device} is absent." >&2
  exit 1
fi

expected_device="$(readlink -f "${stable_device}")"
mounted_device="$(findmnt --noheadings --output SOURCE --target "${OPSFORGE_DATA_MOUNT}" | xargs readlink -f)"
mounted_target="$(findmnt --noheadings --output TARGET --target "${OPSFORGE_DATA_MOUNT}" | xargs)"
if [[ "${mounted_device}" != "${expected_device}" || "${mounted_target}" != "${OPSFORGE_DATA_MOUNT}" ]]; then
  echo "K3s data mount does not resolve to retained volume ${OPSFORGE_DATA_VOLUME_ID}." >&2
  exit 1
fi

requires_mounts_for="$(systemctl show k3s.service --property=RequiresMountsFor --value)"
if ! tr ' ' '\n' <<<"${requires_mounts_for}" | grep -qxF "${OPSFORGE_DATA_MOUNT}"; then
  echo "k3s.service does not declare RequiresMountsFor=${OPSFORGE_DATA_MOUNT}." >&2
  exit 1
fi

k3s kubectl wait --for=condition=Ready node --all --timeout=300s
mapfile -t nodes < <(k3s kubectl get nodes --output name)
if ((${#nodes[@]} != 1)); then
  echo "Storage attestation requires exactly one K3s node; found ${#nodes[@]}." >&2
  exit 1
fi

node_name="${nodes[0]#node/}"
boot_id="$(< /proc/sys/kernel/random/boot_id)"
k3s kubectl annotate node "${node_name}" --overwrite \
  "opsforge.io/k3s-data-volume-id=${OPSFORGE_DATA_VOLUME_ID}" \
  "opsforge.io/k3s-data-mount=${OPSFORGE_DATA_MOUNT}" \
  "opsforge.io/k3s-data-boot-id=${boot_id}"
EOF
chown root:root /usr/local/sbin/opsforge-k3s-storage-attest
chmod 0700 /usr/local/sbin/opsforge-k3s-storage-attest

cat >/etc/opsforge/storage-attestation.env <<EOF
OPSFORGE_DATA_MOUNT=${OPSFORGE_DATA_MOUNT}
OPSFORGE_DATA_VOLUME_ID=${OPSFORGE_DATA_VOLUME_ID}
EOF
chown root:root /etc/opsforge/storage-attestation.env
chmod 0600 /etc/opsforge/storage-attestation.env

cat >/etc/systemd/system/opsforge-k3s-storage-attest.service <<'EOF'
[Unit]
Description=Attest that K3s uses the retained OpsForge EBS volume
Requires=k3s.service
After=k3s.service
RequiresMountsFor=/var/lib/rancher/k3s

[Service]
Type=oneshot
EnvironmentFile=/etc/opsforge/storage-attestation.env
ExecStart=/usr/local/sbin/opsforge-k3s-storage-attest
User=root
Group=root
NoNewPrivileges=true
PrivateTmp=true
ProtectControlGroups=true
ProtectHome=true
ProtectKernelModules=true
ProtectKernelTunables=true
ProtectSystem=strict
RemainAfterExit=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable k3s.service
systemctl restart k3s.service
wait_for_k3s_ready

if [[ "${encryption_mode}" == "disabled_unconfigured" ]]; then
  encryption_status="$(secrets_encryption_status)"
  if ! grep -qF "Encryption Status: Disabled, no configuration file found" <<<"${encryption_status}"; then
    echo "Existing cluster changed encryption state before enable; refusing to continue." >&2
    printf '%s\n' "${encryption_status}" >&2
    exit 1
  fi

  k3s secrets-encrypt enable
  printf '%s\n' 'secrets-encryption: true' >>/etc/rancher/k3s/config.yaml
  systemctl restart k3s.service
  wait_for_k3s_ready
  encryption_status="$(secrets_encryption_status)"
  if ! assert_secrets_encryption_start "${encryption_status}"; then
    echo "K3s did not reach Disabled/start/all-hashes-match after encryption enable." >&2
    printf '%s\n' "${encryption_status}" >&2
    exit 1
  fi
elif [[ "${encryption_mode}" == "disabled_start" ]]; then
  encryption_status="$(secrets_encryption_status)"
  if ! assert_secrets_encryption_start "${encryption_status}"; then
    echo "Interrupted encryption migration is not at Disabled/start/all-hashes-match." >&2
    printf '%s\n' "${encryption_status}" >&2
    exit 1
  fi
fi

encryption_status="$(secrets_encryption_status)"
if ! assert_secrets_encryption_finished "${encryption_status}"; then
  if [[ "${encryption_mode}" == "enabled" ]] && ! grep -qF "Current Rotation Stage: start" <<<"${encryption_status}"; then
    echo "Existing encryption rotation is in an unexpected intermediate state; refusing to overwrite it." >&2
    printf '%s\n' "${encryption_status}" >&2
    exit 1
  fi

  k3s secrets-encrypt rotate-keys
  systemctl restart k3s.service
  wait_for_k3s_ready
  wait_for_secrets_encryption_finished
fi

systemctl enable opsforge-k3s-storage-attest.service
systemctl restart opsforge-k3s-storage-attest.service

install -d -o ubuntu -g ubuntu -m 0700 /home/ubuntu/.kube
install -o ubuntu -g ubuntu -m 0600 /etc/rancher/k3s/k3s.yaml /home/ubuntu/.kube/config
# The literal $HOME is evaluated later by the ubuntu user's login shell.
# shellcheck disable=SC2016
kubeconfig_profile_line='export KUBECONFIG="$HOME/.kube/config"'
grep -qxF "${kubeconfig_profile_line}" /home/ubuntu/.profile || \
  printf '\n%s\n' "${kubeconfig_profile_line}" >> /home/ubuntu/.profile

systemctl enable --now opsforge-k3s-backup.timer
systemctl enable --now opsforge-postgres-backup-upload.timer
systemctl start opsforge-k3s-backup.service
