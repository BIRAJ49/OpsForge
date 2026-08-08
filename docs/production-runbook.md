# Production Rollout And Recovery

## Safe Rollout Order

1. Apply Terraform with `enable_ssh_access = true`. Keep `enable_admin_access = false` until Cloudflare Access is available; Grafana and Argo CD remain private.
2. Open an SSM session with the `ssm_command` Terraform output. Confirm `kubectl get nodes` works.
3. Back up the Sealed Secrets key before adopting the controller into Argo CD.
4. Create and validate `OpsForge-GitOps` with `scripts/bootstrap-gitops-repository.sh` and two verified image digest references, then apply `deploy/bootstrap/argocd-root-gitops.yaml` once.
5. Verify the internal Argo applications, OpsForge ingress/certificate, alerts, and NetworkPolicies. The production root intentionally excludes `applications/platform-access.yaml` at this point.
6. When Cloudflare Access is ready, apply a reviewed Terraform change with `enable_admin_access = true`; then use a reviewed GitOps change to add `applications/platform-access.yaml` to the production root. Verify Access before advertising either admin URL.
7. Set `enable_ssh_access = false`, review the Terraform plan, and apply it. Confirm port 22 is absent from the security group.

Do not switch the root application before the dedicated repository exists. Do not remove SSH before a working SSM session is verified.

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

1. Run Terraform apply to recreate AWS and Cloudflare resources.
2. Wait for K3s cloud-init and connect through SSM.
3. Install Argo CD, then restore the Sealed Secrets recovery key.
4. Apply the root application from `OpsForge-GitOps`.
5. Restore the latest verified PostgreSQL dump from S3.
6. Verify DNS, certificates, Argo health, application login, email alerting, logs, and backup creation.
7. Run `scripts/production-acceptance.sh`.

## Acceptance Checks

- An unauthenticated request to Grafana or Argo CD is redirected to Cloudflare Access.
- The configured GitHub identity can open both services.
- Requests sent to the Elastic IP with a forged Host header are rejected outside Cloudflare IP ranges.
- All certificates are Ready and every Argo application is Synced/Healthy.
- Unauthorized pod traffic is blocked while frontend, backend, database, Redis, DNS, email, GitHub, S3, and monitoring flows work.
- A stopped and restarted EC2 instance returns to Healthy without manual workload deployment.
