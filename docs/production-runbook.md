# Legacy K3s Rollout And Recovery

> This file documents the existing single-node compatibility deployment. It is
> not the activation runbook for the canonical multi-environment architecture.
> Use `OpsForge-GitOps/docs/operations.md` for the new-cluster bootstrap or
> non-cascading Argo ownership handoff. Never apply the legacy and canonical
> roots concurrently.

## Safe Rollout Order

1. Keep the legacy root unchanged while the canonical tree is reviewed and the
   new CI/security gates are configured.
2. Produce a new scanned and attested release containing `/api/health/live`,
   `/api/health/ready`, and `/metrics`; the compatibility digests predate those
   endpoints and cannot pass the canonical probes.
3. Configure target-cluster ingress, certificates, ESO workload identity,
   private repository/package access, managed data services, and tested backup
   restore before creating canonical Applications.
4. Prefer bootstrapping `bootstrap/root.yaml` into a new target cluster. If the
   existing cluster must be reused, follow the non-cascading root/Application
   ownership handoff in the GitOps operations guide; do not let both roots own
   Loki, Alloy, monitoring, ingress, or cert-manager concurrently.
5. Validate staging, promote the exact tested digests through a production PR,
   and switch DNS only after readiness, metrics, logs, alerts, migration, and
   rollback checks pass.
6. Remove the legacy root and compatibility tree only after every platform,
   workload, secret, and data dependency has a confirmed canonical owner.

## Sealed Secrets Recovery Key

Export on the cluster and place the file in an encrypted password manager or encrypted offline backup. Never commit it.

```bash
kubectl -n kube-system get secret \
  -l sealedsecrets.bitnami.com/sealed-secrets-key \
  -o yaml > sealed-secrets-recovery-key.yaml
chmod 600 sealed-secrets-recovery-key.yaml
```

Restore the key before starting the controller on a rebuilt cluster:

```bash
kubectl apply -f sealed-secrets-recovery-key.yaml
kubectl -n kube-system rollout restart deployment/sealed-secrets-controller
```

## PostgreSQL Backup And Restore Drill

Run a manual backup and capture its S3 key:

```bash
job="postgres-backup-drill-$(date +%s)"
kubectl -n opsforge-system create job --from=cronjob/postgres-backup "$job"
kubectl -n opsforge-system wait --for=condition=complete "job/$job" --timeout=10m
kubectl -n opsforge-system logs "job/$job"
```

Monthly, restore the latest dump into a temporary PostgreSQL instance, run `pg_restore --list`, compare its SHA-256 checksum to a freshly downloaded second copy, and execute basic row-count and login tests. Record the date, object key, duration, and result in an issue.

## Complete Rebuild

These steps apply only when recovering the compatibility K3s platform. A
canonical recovery provisions the target cluster and workload identity,
restores managed data from a tested backup, installs pinned Argo CD, bootstraps
the GitOps root, and lets ESO retrieve secrets from AWS. Git reconstructs
stateless desired state; it does not restore PostgreSQL, Redis, telemetry data,
DNS, or external credentials.

## Acceptance Checks

- An unauthenticated request to Grafana or Argo CD is redirected to Cloudflare Access.
- The configured GitHub identity can open both services.
- Requests sent to the Elastic IP with a forged Host header are rejected outside Cloudflare IP ranges.
- All certificates are Ready and every Argo application is Synced/Healthy.
- Unauthorized pod traffic is blocked while frontend, backend, database, Redis, DNS, email, GitHub, S3, and monitoring flows work.
- A stopped and restarted EC2 instance returns to Healthy without manual workload deployment.
