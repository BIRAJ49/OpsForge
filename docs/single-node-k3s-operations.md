# Single-Node K3s Operations And Recovery

This is the activation and recovery contract for the cost-constrained OpsForge
track: one EC2 instance, one K3s server using embedded etcd, and retained
encrypted EBS storage. It is suitable for a solo project that accepts downtime
in exchange for lower cost.

## Service Classification

This design is **single-node, single-AZ, and non-HA**. A larger EC2 instance
adds capacity; it does not add redundancy. The following events interrupt the
whole service:

- EC2 host, K3s server, kernel, or Availability Zone failure;
- a bad host upgrade or filesystem failure;
- exhaustion of the one node's CPU, memory, disk, or network;
- loss of the one ingress path;
- failure of node-local PostgreSQL, Redis, Argo CD, or observability services.

An EBS volume can attach only to an EC2 instance in the same Availability Zone.
Retaining a data volume protects it from routine instance replacement, but it
does not make the workload highly available and it does not survive a Regional
disaster by itself. Recovery in another AZ or Region creates a new volume from
a snapshot or AWS Backup recovery point.

Use the description "production-style, cost-constrained, non-HA". Do not claim
a multi-AZ SLA. If continuous availability becomes a requirement, migrate to
multi-AZ compute plus managed PostgreSQL and Redis instead of scaling this node
further.

Official constraints and recovery references:

- [EBS volumes and instances must be in the same AZ](https://docs.aws.amazon.com/ebs/latest/userguide/ebs-attaching-volume.html)
- [AWS Backup cross-Region copies](https://docs.aws.amazon.com/aws-backup/latest/devguide/cross-region-backup.html)
- [K3s backup and restore, including the server-token requirement](https://docs.k3s.io/datastore/backup-restore)
- [K3s embedded-etcd snapshot commands and S3 options](https://docs.k3s.io/cli/etcd-snapshot)

## Non-Negotiable Deployment Boundary

Terraform creates or changes AWS resources. The canonical GitOps repository is
the only source of Kubernetes desired state, and Argo CD reconciles it.

Do not deploy application releases with any of the following:

- `kubectl apply`, `kubectl set image`, or `kubectl rollout restart`;
- `helm install` or `helm upgrade` for an application release;
- SSH commands from GitHub Actions;
- `argocd app sync` from GitHub Actions;
- manually editing a live Deployment, Secret, or image tag.

The only routine release path is:

```text
source PR -> CI/security gate -> build once -> immutable digest
          -> staging GitOps PR -> Argo CD -> staging verification
          -> production GitOps PR for the same digest -> Argo CD
```

Installing K3s and the pinned Argo CD bootstrap is a controlled platform
bootstrap, not an application deployment. Disaster recovery may use imperative
restore commands on an isolated replacement host, but applications must still
return to the desired state stored in Git.

## Required Target State

Before bootstrap, the infrastructure plan must provide all of the following:

- one pinned, supported EC2 AMI and pinned K3s version;
- an on-demand instance protected against accidental termination or replacement;
- SSM Session Manager access; no public SSH ingress;
- IMDSv2 required and pod access to `169.254.169.254` blocked;
- a small encrypted root volume that can be replaced;
- a separate encrypted `gp3` data volume in the instance's AZ, with
  `DeleteOnTermination=false`, mounted by UUID through `/etc/fstab`;
- K3s state and local persistent volumes on the retained data filesystem;
- an S3 backup bucket with KMS encryption, versioning, all public access
  blocked, lifecycle retention, and cross-Region replication;
- an AWS Backup plan for the data volume with an encrypted destination vault in
  a second Region;
- a narrowly scoped EC2 instance profile used by host backups and, on this
  self-managed K3s track, the ESO controller through the AWS SDK credential
  chain; application/data and non-ESO managed platform pods must be denied
  IMDS access, while host-network and system pods remain node-equivalent;
- AWS Secrets Manager values for staging before any staging workload starts;
- an external synthetic check and alert receiver outside this EC2 instance.

The data volume and mount must exist before K3s starts. A replacement instance
must use the same mount contract; otherwise K3s can silently create an empty
directory on the root filesystem. Add a systemd mount dependency so K3s refuses
to start when the data mount is absent.

Do not grant backup-bucket policy, KMS-key administration, backup deletion, or
AWS Backup administration to the EC2 instance role. The narrowly scoped role
may write K3s snapshots and validated PostgreSQL dumps to their exact prefixes,
read the seven declared secret containers, and use only the required KMS key.
ESO intentionally obtains that role through IMDS because this is self-managed
K3s; application/data pods and other managed platform pods are denied IMDS.
The PostgreSQL backup pod writes only to its retained local PVC and receives no
AWS credential. Treat kube-system, host-network, and node-level compromise as
compromise of this scoped role; moving to EKS Pod Identity/IRSA is the isolation
upgrade path.

## Recovery Objectives

These are engineering objectives, not an availability guarantee. Measure them
during drills and publish the observed values.

| Recovery asset | Schedule | Maximum RPO | Minimum retention | Independent copy |
|---|---:|---:|---:|---|
| K3s embedded-etcd snapshot | every 6 hours | 6 hours | 28 local snapshots; 35 days in S3 | S3 cross-Region replication |
| K3s server token | after install and every rotation | last token rotation | 90 days/versioned | S3 cross-Region replication plus offline recovery copy |
| PostgreSQL logical dump | every 6 hours | 6 hours | 35 days | S3 cross-Region replication |
| Retained EBS data volume | daily AWS Backup | 24 hours | 35 days warm | daily copy to a second Region, retained 90 days |
| GitOps desired state | every reviewed merge | last merged commit | repository history | protected remote Git repository |
| Secrets Manager values | after every rotation | last rotation | version history per policy | replicas or documented recreation in the DR Region |

The service recovery-time objective is **two hours** from declaring the
incident to a healthy externally verified service. If a quarterly drill takes
longer, record the measured RTO and either remove the two-hour claim or improve
automation before production activation.

Redis is treated as disposable cache/coordination state unless a feature has a
documented durable dependency on it. Logs and metrics must be exported off-node
if their survival is required; an EBS snapshot is only a coarse recovery layer.

## Backup Contracts

### K3s embedded etcd

Confirm K3s is configured for embedded etcd. A SQLite datastore requires a
different backup procedure and does not satisfy this runbook.

The pinned K3s server configuration should include equivalent settings, with
bucket and Region supplied by infrastructure output rather than handwritten
values:

```yaml
cluster-init: true
etcd-snapshot-schedule-cron: "0 */6 * * *"
etcd-snapshot-retention: 28
etcd-s3: true
etcd-s3-bucket: "<backup-bucket>"
etcd-s3-folder: "k3s/etcd"
etcd-s3-region: "<workload-region>"
etcd-s3-timeout: "5m"
```

The S3 objects must be encrypted with the backup KMS key. Alert when the newest
snapshot is older than eight hours, the object is zero bytes, upload fails, or
cross-Region replication does not complete.

K3s encrypts confidential datastore content using the server token at
`/var/lib/rancher/k3s/server/token`. An etcd snapshot without the matching token
is unusable. Back up the token separately:

- never print it to a terminal, CI log, ticket, or shell history;
- encrypt it client-side for the recovery operator and again with S3 SSE-KMS;
- store it under `k3s/token/` with a checksum and creation timestamp;
- upload a new version immediately after `k3s token rotate`;
- keep a second encrypted offline copy in the recovery password manager;
- test decryption only inside the isolated quarterly restore environment.

Do not store the token in Git, Terraform state, a user-data template, or an EBS
snapshot as its only backup.

### PostgreSQL logical backups

The scheduled Kubernetes workload creates a self-contained custom-format dump
on the retained `postgres-backups` local-path PVC:

```text
pg_dump --format=custom --compress=9 --no-owner --no-acl
```

The pod receives only database credentials from External Secrets. It has no AWS
credential. Its output contract is:

1. write a dump to `/backups/ready/.<UTC-stem>.dump.partial`;
2. run `pg_restore --list` against the completed local dump;
3. calculate SHA-256 and create `<UTC-stem>.sha256` plus
   `<UTC-stem>.manifest.json` containing UTC time, environment, database name,
   PostgreSQL version, exact pinned image digest in `image_revision`, byte
   count, and checksum;
4. atomically rename the validated dump to `<UTC-stem>.dump`;
5. atomically write `<UTC-stem>.ready` **last** so an uploader cannot observe a
   partial set;
6. expose local-backup success time and failure metrics for alerting.

A host systemd timer runs every 15 minutes and is the only S3 writer. It:

1. resolves each environment's `postgres-backups` PVC to its bound PV and reads
   `.spec.hostPath.path` rather than using an unbounded filesystem search;
2. resolves symlinks and refuses any path outside
   `/var/lib/rancher/k3s/storage/`;
3. consumes only sets with the final `.ready` marker and verifies SHA-256 and
   required manifest fields again;
4. uploads all files to immutable keys under
   `postgres/<environment>/<UTC-stem>/` with explicit SSE-KMS settings;
5. uses S3 `HeadObject` to confirm encryption, byte count, checksum metadata,
   and later cross-Region replication;
6. writes a local `<UTC-stem>.uploaded` marker only after verification and does
   not delete local or S3 objects.

The uploader uses the narrowly scoped host-backup identity. Its policy permits
only listing the required bucket and writing/reading metadata beneath `k3s/`
and `postgres/`; it cannot delete object versions or administer S3/KMS. Pod
access to IMDS remains blocked.

Use immutable, time-stamped object keys. Do not overwrite `latest.dump`; a small
pointer object is acceptable only when the immutable object remains the restore
source. Alert independently when no validated local dump or no verified S3
upload is present within eight hours.

An EBS snapshot is not a substitute for the logical dump. A logical dump gives
a PostgreSQL-aware, independently verifiable restore path; the EBS recovery
point accelerates whole-node recovery.

### EBS and AWS Backup

Tag the retained data volume for selection by AWS Backup. The backup plan must
take a daily encrypted recovery point and copy it to an encrypted vault in a
different Region. The copy job, not only the source backup job, must be
monitored.

The data volume must remain in the instance AZ while attached. During recovery,
AWS Backup creates a new volume in the replacement instance's selected AZ. A
cross-Region copy allows the same process in the DR Region. Never attempt to
attach one Region's or AZ's original volume to an incompatible instance.

EBS snapshots are crash-consistent. The etcd snapshot and PostgreSQL dump are
the authoritative application-consistent backups. Restore them even when an
EBS recovery point is used to accelerate recovery.

### S3 protection

The source and destination buckets must have:

- KMS-backed default encryption and a policy denying unencrypted writes;
- versioning and all four S3 Block Public Access controls;
- cross-Region replication with replication failure metrics/alerts;
- Object Lock in governance mode where account policy permits it;
- lifecycle rules that preserve the documented retention periods;
- a backup writer that cannot delete versions or change bucket policy;
- a separate recovery role that can read and decrypt backups.

Replication is asynchronous. The readiness check validates the latest source
object's replication status, but the restore drill must retrieve from the
destination Region to prove the independent copy works.

## Read-Only Readiness Check

Run the repository validator from an operator workstation with read-only AWS
and Kubernetes credentials. Select the exact context; never rely on whatever
context happens to be current.

```bash
OPSFORGE_AWS_PROFILE=opsforge-readonly \
OPSFORGE_AWS_REGION=<primary-region> \
OPSFORGE_DR_REGION=<recovery-region> \
OPSFORGE_INSTANCE_ID=<instance-id> \
OPSFORGE_BACKUP_BUCKET=<source-bucket> \
OPSFORGE_BACKUP_KMS_KEY_ARN=<primary-multi-region-key-arn> \
OPSFORGE_DR_BACKUP_BUCKET=<destination-bucket> \
OPSFORGE_DR_BACKUP_KMS_KEY_ARN=<replica-key-arn> \
OPSFORGE_DR_BACKUP_VAULT_ARN=<destination-vault-arn> \
OPSFORGE_EXPECTED_AMI_ID=<approved-ami-id> \
OPSFORGE_EXPECTED_K3S_VERSION=<approved-k3s-version> \
OPSFORGE_EXPECTED_POSTGRES_IMAGE_REVISION=<sha256-image-digest> \
OPSFORGE_CLUSTER_CONTEXT=<staging-context> \
OPSFORGE_ENVIRONMENT=staging \
./scripts/validate-single-node-readiness.sh
```

The validator performs only read operations: `get`, `describe`, `list`, `head`,
and downloads of the small, non-secret JSON manifests that bind artifacts to
their checksums and image revision. It checks the one-node classification,
retained encrypted EBS storage, IMDSv2, bucket controls, backup freshness,
object replication, recent EBS backup/copy jobs, Argo reconciliation, and
staging readiness. It never downloads a database dump, etcd snapshot, or
encrypted server-token payload.

A passing validator does not prove a backup can be restored. Only a completed
isolated restore drill supplies that evidence.

On the node, also perform this read-only storage preflight through SSM before
starting K3s and after every instance replacement:

```bash
sudo findmnt --target /var/lib/rancher/k3s \
  --output SOURCE,TARGET,FSTYPE,OPTIONS
lsblk --output NAME,TYPE,SIZE,FSTYPE,MOUNTPOINTS
systemctl show k3s --property=RequiresMountsFor
sudo k3s etcd-snapshot ls
```

The K3s data path must resolve to the retained data filesystem, not the root
volume; `RequiresMountsFor` must name that path; and both local and S3 snapshot
inventory must be visible. These commands inspect state only.

## Staging-First Activation

Do not apply a root that creates staging and production together. Do not launch
production workloads merely to test infrastructure.

Use this order:

1. Review and apply the exact Terraform plan through the protected
   infrastructure process. Do not create the instance, volume, bucket, roles,
   or vault manually in the AWS console.
2. Verify the retained data mount and systemd dependency before installing the
   pinned K3s version.
3. Configure K3s embedded-etcd snapshots and upload the encrypted matching
   server-token recovery package.
4. Configure AWS Backup and wait for a successful source recovery point and a
   successful cross-Region copy.
5. Create staging Secrets Manager values, External Secrets identity, private
   GitOps repository credential, and private GHCR pull credential.
6. Install pinned Argo CD and External Secrets versions, then bootstrap only the
   canonical staging application tree.
7. Merge the staging digest-promotion PR and allow Argo CD to reconcile it.
8. Verify migration success, readiness/liveness, metrics, logs, alert delivery,
   external HTTPS, a rollback by Git revert, PostgreSQL logical backup, K3s
   snapshot, and cross-Region copy.
9. Complete the isolated restore drill below and record measured RPO/RTO.
10. Only then create the production secrets and submit a reviewed production
    GitOps PR promoting the exact digests proven in staging.

Production activation requires an explicit go/no-go record. A skipped backup,
alert, restore, migration, or rollback check is a **no-go**.

## Quarterly Isolated Restore Drill

The drill is destructive to the disposable recovery environment. It must never
target the live instance, live volumes, production Kubernetes context, primary
database endpoint, production DNS, or production notification credentials.

### Guardrails

- Create the recovery environment from reviewed Terraform in a separate VPC or
  account, preferably in the DR Region.
- Use a distinct kubeconfig context ending in `-restore-drill`.
- Deny outbound email, webhooks, OAuth callbacks, and public DNS changes.
- Record the exact source recovery-point ARN and S3 object version IDs.
- Keep the live cluster running; never attach its mounted volume elsewhere.
- Require a second operator check before any restore command that contains
  `--cluster-reset`, `pg_restore --clean`, or an AWS restore operation.

### Drill sequence

1. Start the RTO clock when the incident is declared.
2. Recreate a disposable instance and encrypted data volume through Terraform
   in the recovery Region/AZ.
3. Retrieve the latest **replicated** K3s snapshot and its matching encrypted
   token version using the recovery role. Verify checksums before decryption.
4. Install the same pinned K3s version. Stop K3s, place the token at the required
   path with owner-only permissions, and restore the embedded-etcd snapshot
   using the documented K3s `--cluster-reset-restore-path` procedure.
5. Restart K3s without the reset flag. Confirm one Ready node and that the
   Kubernetes API contains the expected namespaces and Argo objects.
6. Restore the selected PostgreSQL dump into a new, empty drill database. Never
   use `--clean` against an existing database. Run migrations only through the
   same Argo PreSync mechanism used in normal delivery.
7. Run schema checks, representative row counts, login against drill-only user
   credentials, and application read/write tests. Check that no email or webhook
   left the isolated environment.
8. Let Argo CD reconcile the exact GitOps commit recorded in the drill evidence
   before restoration, and verify its immutable application digests against
   that commit. The backup manifest binds the PostgreSQL image and dump, not a
   Git commit. Do not manually deploy manifests or substitute a newer image.
9. Verify health, readiness, metrics, logs, alerts, ingress, and Git-revert
   rollback inside the drill environment.
10. Stop the RTO clock at externally verified application health. Record the
    newest committed transaction recovered to calculate observed RPO.
11. Destroy only the Terraform-managed drill stack after evidence is retained.
    Never reuse the restored token or drill credentials in production.

The evidence record must include:

- date, operator, ticket, source and destination Regions;
- GitOps commit and immutable image digests;
- K3s version, snapshot object/version/checksum, and token version reference;
- PostgreSQL object/version/checksum and source PostgreSQL version;
- EBS recovery-point ARN and AWS Backup copy-job ID;
- backup ages, observed RPO, observed RTO, and all validation results;
- deviations, corrective actions, owners, and due dates.

## Incident Recovery Decision

Use the smallest recovery path that addresses the failure:

| Failure | Recovery path |
|---|---|
| application regression | revert the GitOps promotion commit; Argo CD reconciles the previous digests |
| failed backward-compatible migration | follow the migration rollback/forward-fix plan; do not restore the whole node by default |
| replaceable EC2 failure in the same AZ | create a replacement through Terraform and attach or restore retained storage after filesystem checks |
| corrupt K3s datastore | restore embedded etcd with the matching token in a controlled maintenance recovery |
| corrupt PostgreSQL data | restore the selected logical dump into a new database, validate it, then change desired configuration through Git |
| lost data volume | restore a same-Region AWS Backup recovery point into a new encrypted volume in the instance AZ |
| AZ failure | provision in another AZ and create a new volume from the same-Region recovery point |
| Regional failure | provision the DR stack and restore cross-Region S3/AWS Backup copies |

Do not improvise a direct deployment during an incident. Git reconstructs
stateless desired state; S3/AWS Backup reconstruct stateful data. Record every
emergency mutation, remove drift, and return Argo CD to `Synced` and `Healthy`.

## Production Go/No-Go Checklist

Production remains disabled until every item is evidenced:

- [ ] the repository validator passes against staging;
- [ ] all staging Argo applications are `Synced` and `Healthy`;
- [ ] application images are immutable digests already tested in staging;
- [ ] External Secrets and private GHCR pulls succeed through the documented
      ESO-only IMDS exception, while other Git-managed workload and platform
      pods remain unable to reach IMDS;
- [ ] newest etcd and PostgreSQL backups meet the six-hour RPO;
- [ ] newest EBS backup and cross-Region copy meet the 24-hour RPO;
- [ ] K3s token backup is encrypted, replicated, and recoverable;
- [ ] an isolated restore drill meets the two-hour RTO;
- [ ] database migration and Git-revert rollback tests pass;
- [ ] external synthetic monitoring and a real Alertmanager receiver page the operator;
- [ ] DNS cutover and rollback are documented without exposing origin services;
- [ ] the non-HA risk and expected outage during node/AZ failure are accepted.

Only after this checklist passes should an operator approve the production
GitOps promotion. Argo CD—not the operator or GitHub Actions—performs the
application reconciliation.
