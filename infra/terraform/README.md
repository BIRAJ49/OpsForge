# Hardened single-node K3s infrastructure

This Terraform root builds one on-demand EC2 node. It is deliberately a
single-node production design: a node or Availability Zone outage interrupts
the service even though retained storage and cross-region backups improve
recovery.

## Safety boundary

Terraform does not apply automatically. The default configuration fails its
plan until `single_node_cutover_acknowledgement` is set exactly to:

```text
I_HAVE_VERIFIED_BACKUPS_AND_THE_K3S_DATA_MIGRATION_PLAN
```

Do not set it merely to make a plan pass. First verify a current PostgreSQL
logical dump, a K3s datastore backup and server token (or a restorable legacy
root-volume snapshot), and a tested rollback route. The old node currently may
store database/PVC data on its root disk; attaching an empty EBS volume does not
migrate that data.

`user_data_replace_on_change` is disabled so a bootstrap-script edit cannot
replace the existing node. The EC2 API termination guard and the data volume's
Terraform `prevent_destroy` add further friction. They do not replace backups.

## Storage contract

- Root: encrypted gp3, 50 GiB by default, disposable after recovery is proven.
- Data: standalone encrypted gp3, 300 GiB by default, attached with EC2's
  `DeleteOnTermination=false` behavior and protected by `prevent_destroy`.
- K3s data dir: `/var/lib/rancher/k3s`.
- Local-path PVC root: `/var/lib/rancher/k3s/storage`.
- PostgreSQL backup PVCs: `postgres-backups` in `opsforge-staging` and
  `opsforge-production`.
- Completed dump handoff:
  `<pv>/ready/<UTC-stem>.{dump,sha256,manifest.json,ready}`.

The host uploader resolves each PVC to its PV, requires the path to remain
under the storage root with the expected local-path directory suffix, validates
the manifest's `schema`, `environment`, `database`, `created_at`, `format`,
`postgres_version`, `image_revision` (the exact pinned PostgreSQL image digest),
`size_bytes`, and `sha256`, uploads each immutable timestamped bundle, verifies
remote size/encryption/checksum metadata, and only then creates
`<UTC-stem>.uploaded`. Dumps over 4 GiB use conditional multipart upload with
64 MiB parts, per-part SHA-256, a verified composite SHA-256, and retry-safe
`If-None-Match: *` completion; incomplete uploads are aborted and lifecycle-
expired after one day.
The node role has no S3 delete permission.

K3s runs with embedded etcd and encrypted Kubernetes secrets. A migrated legacy
cluster follows K3s's guarded enable sequence: consistent pre-backup, `enable`,
config/restart, exact `Disabled/start/all hashes match` checkpoint, `rotate-keys`,
restart, then exact `Enabled/reencrypt_finished/all hashes match` verification.
Backup timers and storage attestation remain disabled if any checkpoint fails.
Every six hours a
host service uploads a compressed etcd snapshot under `k3s/etcd/<timestamp>/`
and a client-side KMS ciphertext of the matching server token under
`k3s/token/<timestamp>/`. PostgreSQL bundles
use `postgres/<environment>/<timestamp>/`. All primary objects use the dedicated
multi-Region KMS primary key and replicate to the disaster-recovery region,
where the corresponding KMS replica protects them. AWS Backup also snapshots
the entire data EBS volume daily and copies recovery points to the DR vault.
The built-in K3s scheduler is disabled so the host timer is the single,
deterministic six-hour snapshot schedule; it retains 28 verified local snapshots.

The token is encrypted client-side with the fixed encryption context
`purpose=opsforge-k3s-server-token`; plaintext is never sent to S3. Because the
primary and DR keys are one AWS KMS multi-Region key, a recovery operator can
decrypt replicated ciphertext in the DR region. Download the ciphertext and
checksum into a mode-0700 temporary directory, then run:

```bash
umask 077
(
  cd /path/to/recovery-directory
  sha256sum --check --strict server-token.kms.sha256
)
aws kms decrypt \
  --region us-west-2 \
  --key-id "$(terraform -chdir=infra/terraform output -raw disaster_recovery_kms_key_arn)" \
  --ciphertext-blob fileb:///path/to/recovery-directory/server-token.kms \
  --encryption-context purpose=opsforge-k3s-server-token \
  --query Plaintext \
  --output text \
  | base64 --decode > /path/to/recovery-directory/server-token
chmod 0600 /path/to/recovery-directory/server-token
```

Never print the plaintext token. A different or missing encryption context must
make KMS decryption fail. Verify the downloaded S3 object's checksum, destination
KMS key, token manifest, and ciphertext SHA-256 before decrypting it.

## Existing-node migration

1. Stop application writes and create/restore-test a PostgreSQL logical dump.
2. Record `terraform state pull`, the current instance/root volume IDs, and the
   latest off-node backup locations.
3. Review the plan. A change to `ami`, `key_name`, subnet, or other replacement
   field means stop; do not approve a replacement as a migration shortcut.
4. During the maintenance window, stop application writes and the instance,
   review the complete saved plan again, and require **zero deletes and zero EC2
   replacement paths**. Apply that complete plan once; do not use `-target`.
   Start the existing instance afterward and wait until it is Online in SSM.
5. Run the exact non-interactive migration command emitted by Terraform:

   ```bash
   terraform -chdir=infra/terraform output -raw ssm_migrate_k3s_data_command
   # Review the rendered instance ID, volume ID, document, and both acknowledgements,
   # then copy/paste that output as the command to execute.
   ```

   The target-typed Command document embeds the checksum-stable migration script;
   no SCP, SSH, or manual file creation is required. Its parameters accept only
   the exact attached `vol-*` ID and both exact acknowledgement phrases. It
   refuses a mounted target, unknown/non-empty volume, root device, or failed
   checksum verification. It stops K3s, excludes ext4's `lost+found`, preserves
   the old directory as `/var/lib/rancher/k3s.root-backup-<UTC>`, mounts by
   filesystem UUID, and restarts only after byte-level rsync verification.
6. Verify node readiness, every PVC, PostgreSQL/Redis data, and GitOps
   reconciliation. Then run the explicit command from
   `terraform output -raw ssm_configure_k3s_command` to install the pinned K3s
   configuration and host backup timers on the existing node. Verify both host
   backup services, S3 KMS/checksum metadata, cross-region replication, and an
   EC2 reboot. Keep the old root copy and snapshots until a restore drill passes.

If the migration verification fails, K3s remains stopped. To roll back, use an
SSM shell and first verify that every resolved path below is exact; never use a
glob or an unvalidated mount/backup path:

```bash
sudo -i
set -euo pipefail
target=/var/lib/rancher/k3s
receipt="${target}/.opsforge-k3s-data-migrated"
test -s "${receipt}"
root_backup="$(awk -F= '$1 == "migrated_from" {print $2}' "${receipt}")"
case "${root_backup}" in
  /var/lib/rancher/k3s.root-backup-[0-9]*T[0-9]*Z) ;;
  *) echo "Unexpected rollback path: ${root_backup}" >&2; exit 1 ;;
esac
test -d "${root_backup}"
mount_source="$(findmnt --noheadings --output SOURCE --target "${target}")"
data_uuid="$(blkid -o value -s UUID "${mount_source}")"
fstab_line="UUID=${data_uuid} ${target} ext4 defaults,nofail,x-systemd.device-timeout=120 0 2"
grep -qxF "${fstab_line}" /etc/fstab
systemctl stop k3s.service
umount "${target}"
rmdir "${target}"
fstab_tmp="$(mktemp /etc/fstab.opsforge.XXXXXX)"
awk -v exact="${fstab_line}" '$0 != exact' /etc/fstab >"${fstab_tmp}"
install -o root -g root -m 0644 "${fstab_tmp}" /etc/fstab
rm -f "${fstab_tmp}"
rm -f /etc/systemd/system/k3s.service.d/10-retained-data-mount.conf
mv "${root_backup}" "${target}"
systemctl daemon-reload
systemctl start k3s.service
k3s kubectl wait --for=condition=Ready node --all --timeout=300s
```

Do not roll back after accepting writes on the new volume without a separate,
reviewed reverse data migration; that would discard those writes.

For a brand-new instance, cloud-init waits for the retained EBS attachment,
formats only a blank device, refuses to hide existing root data, mounts it first,
then installs the exact checksum-pinned K3s binary.

The bootstrap does not use Ubuntu's `awscli` package. It downloads the exact
Linux x86_64 AWS CLI v2 zip configured by `aws_cli_version`, verifies the pinned
SHA-256 before extraction, installs it under `/usr/local/aws-cli`, checks the
reported version, and verifies that its S3 model exposes conditional
single-part and multipart completion plus checksum controls before enabling
either backup timer.

## Secure operator kubeconfig access

Do not open port 22 or 6443 in the security group. Configure OpenSSH to traverse
Session Manager locally (replace the region and key path):

```sshconfig
Host i-* mi-*
  User ubuntu
  IdentityFile ~/.ssh/opsforge-gitops
  ProxyCommand sh -c "aws ssm start-session --region us-east-1 --target %h --document-name AWS-StartSSHSession --parameters 'portNumber=%p'"
```

Then copy—not print—the ubuntu-owned admin kubeconfig through that encrypted SSM
SSH channel and lock down the local file:

```bash
instance_id="$(terraform -chdir=infra/terraform output -raw instance_id)"
install -d -m 0700 "${HOME}/.kube"
scp "${instance_id}:/home/ubuntu/.kube/config" "${HOME}/.kube/opsforge-production-admin.yaml"
chmod 0600 "${HOME}/.kube/opsforge-production-admin.yaml"
kubectl --kubeconfig "${HOME}/.kube/opsforge-production-admin.yaml" \
  config set-cluster default --server=https://127.0.0.1:16443
kubectl --kubeconfig "${HOME}/.kube/opsforge-production-admin.yaml" \
  config rename-context default opsforge-production-admin
```

In a separate terminal, keep this session open while using that context:

```bash
aws ssm start-session \
  --region us-east-1 \
  --target "$(terraform -chdir=infra/terraform output -raw instance_id)" \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["6443"],"localPortNumber":["16443"]}'
```

This avoids placing the admin certificate in Run Command output or opening a
public management port. Treat the copied kubeconfig as a root-equivalent secret.

## Plan workflow

Copy `terraform.tfvars.example` to an ignored `.tfvars` file and replace every
placeholder. Keep SSH ingress disabled after SSM is verified. The pinned Ubuntu
AMI ID is region-specific; choose a Canonical-owned Ubuntu 24.04 amd64 image and
update it deliberately when changing regions.

```bash
terraform -chdir=infra/terraform init
terraform -chdir=infra/terraform fmt -check -recursive
terraform -chdir=infra/terraform validate
terraform -chdir=infra/terraform plan -out=tfplan
terraform -chdir=infra/terraform show tfplan
```

The default `m7i.2xlarge`, storage, monitoring, backups, and cross-region copies
are not compatible with the old $50 budget. The example uses $450 as a
conservative alert threshold; review the current AWS calculator for the chosen
region. A lower threshold requires an explicit budget acknowledgement.

## Secrets and workload identity limitation

Terraform creates only named Secrets Manager containers; it never creates
secret versions or values. Populate them out-of-band. Each container has a
KMS-encrypted replica in the disaster-recovery region. On self-managed K3s there
is no native EKS IRSA. External Secrets and the local backup workloads therefore
use the node instance profile/default AWS SDK credential chain. IMDSv2 is
required and its hop limit is two so those pods can retrieve credentials. The
role is restricted to the seven exact `/opsforge/...` secret ARNs, four backup
prefixes, and the one backup KMS key, but any compromised pod capable of reaching
IMDS can obtain that same scoped role. NetworkPolicy/host firewall controls and
moving secrets/data services to managed AWS services are the path to stronger
isolation.

## Recovery identity and alert activation

The node and CI do not trust or assume the recovery role. A human account
principal with its own `sts:AssumeRole` permission and an MFA-authenticated
session can assume the one-hour read-only role. It can list/get only the four DR
recovery prefixes and decrypt only with the DR multi-Region replica key; it has no
write, delete, IAM, or administration actions. Capture credentials without
printing them:

```bash
read -r AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN < <(
  aws sts assume-role \
    --role-arn "$(terraform -chdir=infra/terraform output -raw recovery_reader_role_arn)" \
    --role-session-name opsforge-dr-restore \
    --serial-number arn:aws:iam::ACCOUNT_ID:mfa/OPERATOR \
    --token-code 123456 \
    --query 'Credentials.[AccessKeyId,SecretAccessKey,SessionToken]' \
    --output text
)
export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
```

Terraform also creates an SNS operations topic encrypted with a dedicated
customer-managed KMS key, explicit EventBridge/CloudWatch publisher grants, an
email subscription, AWS Backup job/copy failure routing, an S3 replication
failure alarm, and host backup `OnFailure` notifications. Production activation
is blocked operationally until the operator confirms the SNS email subscription
and proves test delivery; Terraform cannot confirm an email endpoint on the
recipient's behalf.

## IAM bootstrap boundary

`oidc.tf` is legacy bootstrap configuration and currently grants its apply role
IAM administration over `opsforge-*`. Do not enable Terraform automation with
that role. Move GitHub OIDC, delivery roles/policies, and the EC2 instance profile
to a separately state-backed bootstrap root, then have this routine root consume
pre-created role/profile names. State must be moved/imported explicitly before
deleting declarations; otherwise Terraform may destroy or recreate identities.
Until that state migration is completed and reviewed, use an operator session
for plans only and keep routine applies disabled.
