#!/usr/bin/env bash
set -euo pipefail
umask 077

readonly acknowledgement="I_HAVE_VERIFIED_BACKUPS_AND_THE_K3S_DATA_MIGRATION_PLAN"
readonly migration_acknowledgement="MIGRATE_ROOT_K3S_DATA"
readonly target_mount="/var/lib/rancher/k3s"
readonly temporary_mount="/mnt/opsforge-k3s-migration"

usage() {
  echo "Usage: sudo $0 <vol-id> ${acknowledgement} ${migration_acknowledgement}" >&2
}

if [[ "${EUID}" -ne 0 || "$#" -ne 3 || "$2" != "${acknowledgement}" || "$3" != "${migration_acknowledgement}" ]]; then
  usage
  exit 64
fi

readonly volume_id="$1"
if [[ ! "${volume_id}" =~ ^vol-[0-9a-f]+$ ]]; then
  echo "Invalid EBS volume ID: ${volume_id}" >&2
  exit 64
fi

if findmnt --mountpoint "${target_mount}" >/dev/null 2>&1; then
  echo "${target_mount} is already a mount point; no root-disk migration is needed." >&2
  exit 1
fi
if [[ ! -d "${target_mount}" ]] || ! find "${target_mount}" -mindepth 1 -maxdepth 1 -print -quit | grep -q .; then
  echo "No existing root-disk K3s data found at ${target_mount}; use first-boot bootstrap instead." >&2
  exit 1
fi

volume_id_without_dash="${volume_id//-/}"
stable_device="/dev/disk/by-id/nvme-Amazon_Elastic_Block_Store_${volume_id_without_dash}"
data_device=""
if [[ -b "${stable_device}" ]]; then
  data_device="$(readlink -f "${stable_device}")"
fi
if [[ -z "${data_device}" ]]; then
  echo "The expected EBS volume is not attached to this node." >&2
  exit 1
fi

root_partition="$(findmnt --noheadings --output SOURCE / | xargs readlink -f)"
root_parent="$(lsblk --noheadings --output PKNAME "${root_partition}" | xargs)"
root_device="${root_partition}"
if [[ -n "${root_parent}" ]]; then
  root_device="/dev/${root_parent}"
fi
if [[ "${data_device}" == "${root_device}" || "${data_device}" == "${root_partition}" ]]; then
  echo "Refusing to operate on root device ${root_device}." >&2
  exit 1
fi

filesystem_type="$(blkid -o value -s TYPE "${data_device}" || true)"
if [[ -z "${filesystem_type}" ]]; then
  mkfs.ext4 -F -L OPSFORGE_K3S_DATA "${data_device}"
elif [[ "${filesystem_type}" != "ext4" ]]; then
  echo "Expected a blank or ext4 data volume; found ${filesystem_type}." >&2
  exit 1
fi

mkdir -p "${temporary_mount}"
mount "${data_device}" "${temporary_mount}"
trap 'mountpoint -q "${temporary_mount}" && umount "${temporary_mount}" || true' EXIT

if find "${temporary_mount}" -mindepth 1 -maxdepth 1 ! -name lost+found -print -quit | grep -q .; then
  echo "The target EBS volume is not empty. Inspect it manually; this script will not merge unknown data." >&2
  exit 1
fi

if systemctl is-active --quiet k3s; then
  if k3s etcd-snapshot save --name pre-ebs-migration --etcd-snapshot-compress; then
    echo "Created a pre-migration embedded-etcd snapshot. Confirm its off-node copy before continuing." >&2
  else
    echo "The current cluster did not create an embedded-etcd snapshot (it may use SQLite)." >&2
  fi
fi

systemctl stop k3s
rsync --archive --hard-links --acls --xattrs --numeric-ids \
  --exclude=/lost+found \
  "${target_mount}/" "${temporary_mount}/"

verification_output="$(rsync --archive --hard-links --acls --xattrs --numeric-ids \
  --checksum --delete --dry-run --itemize-changes \
  --exclude=/lost+found \
  "${target_mount}/" "${temporary_mount}/")"
if [[ -n "${verification_output}" ]]; then
  echo "Rsync verification found differences; K3s remains stopped." >&2
  printf '%s\n' "${verification_output}" >&2
  exit 1
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
root_backup="${target_mount}.root-backup-${timestamp}"
umount "${temporary_mount}"
trap - EXIT
rmdir "${temporary_mount}"
mv "${target_mount}" "${root_backup}"
mkdir -p "${target_mount}"

data_uuid="$(blkid -o value -s UUID "${data_device}")"
fstab_entry="UUID=${data_uuid} ${target_mount} ext4 defaults,nofail,x-systemd.device-timeout=120 0 2"
grep -qF "UUID=${data_uuid} " /etc/fstab || printf '%s\n' "${fstab_entry}" >> /etc/fstab
mount "${target_mount}"

mounted_device="$(findmnt --noheadings --output SOURCE --target "${target_mount}" | xargs readlink -f)"
if [[ "${mounted_device}" != "${data_device}" ]]; then
  echo "Mounted ${mounted_device}, expected ${data_device}; K3s remains stopped." >&2
  exit 1
fi

printf 'migrated_from=%s\nmigrated_at=%s\nvolume_id=%s\n' "${root_backup}" "${timestamp}" "${volume_id}" >"${target_mount}/.opsforge-k3s-data-migrated"
chmod 0600 "${target_mount}/.opsforge-k3s-data-migrated"
mkdir -p /etc/systemd/system/k3s.service.d
cat >/etc/systemd/system/k3s.service.d/10-retained-data-mount.conf <<'EOF'
[Unit]
RequiresMountsFor=/var/lib/rancher/k3s
EOF
systemctl daemon-reload
systemctl start k3s
k3s kubectl wait --for=condition=Ready node --all --timeout=300s

echo "K3s data now uses ${volume_id}; the rollback copy remains at ${root_backup}."
echo "Do not remove the rollback copy until workloads, PostgreSQL, Redis, PVCs, snapshots, and an instance reboot are verified."
