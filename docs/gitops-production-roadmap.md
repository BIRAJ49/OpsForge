# GitOps Production Roadmap

## Decision

The current EC2/K3s platform is a useful low-cost, non-HA deployment. It should not be described as an industry-standard highly available production platform: the application, Argo CD, ingress, PostgreSQL, Redis, monitoring, and persistent volumes share one node and one availability zone.

Keep K3s only when that availability limit is an explicit business decision. For a conventional production target, use managed Kubernetes across multiple availability zones, managed PostgreSQL and Redis, workload identity, an external secret store, policy enforcement, and a dedicated workload cluster for user-generated applications.

## Blockers Before Enabling Production Promotion

1. **Establish Git and approval boundaries.** Protect `main` in the source, platform, and GitOps repositories. Require CODEOWNER approval for production, stale-review dismissal, conversation resolution, and no administrator bypass. Keep the GitOps render-and-digest validation check required.
2. **Create the real GitOps source of truth.** The bootstrap helper can create a digest-pinned, production-only migration scaffold, but that copy is not the target architecture. Move Kubernetes desired state into the multi-environment repository below, validate it, and bootstrap Argo CD from it before accepting production deployment pull requests. Do not maintain copied platform manifests in two repositories.
3. **Restrict Argo CD tenants.** Stop using the unrestricted `default` AppProject for generated applications. Define separate `platform`, `opsforge`, and `tenant` AppProjects with exact source repositories, namespace destinations, and resource-kind allowlists. Put user-controlled workloads in a separate sandbox cluster/account before accepting untrusted repositories.
4. **Remove direct cluster mutation from the web API.** The backend currently has cluster-wide update/patch permissions for workloads and Argo resources. Observability should be read-only; deployments, restarts, and application registration should become reviewed Git changes. Use namespace-scoped operational roles only for explicitly approved break-glass actions.
5. **Close the node-credential path.** Pods can reach EC2 instance metadata while the node role can access backups and SSM. Move backup access to EKS Pod Identity/IRSA (or another workload identity), block `169.254.169.254` from workloads, and enforce default-deny policies in every tenant namespace.
6. **Fix secret handling.** Move deployment secrets to AWS Secrets Manager with External Secrets Operator and workload identity. Encrypt existing database-stored integration tokens with KMS-backed envelope encryption and rotate them. Never emit verification or reset codes to production logs.
7. **Make data recoverable before making compute replaceable.** The current AMI selection can replace the only node while PostgreSQL uses node-local storage. Pin approved machine/K3s versions, move PostgreSQL to RDS Multi-AZ with PITR, move Redis to ElastiCache, and run automated restore tests. If K3s remains, use retained encrypted EBS volumes and tested off-node cluster/data backups.
8. **Enforce immutable workloads.** Production overlays must contain image digests, not `latest` or mutable SHA tags. Require both expected OpsForge images and enforce allowed registries, digest pinning, restricted pod settings, probes, resource limits, and NetworkPolicies at admission if those controls are added later.
9. **Gate administrative ingress.** Keep `applications/platform-access.yaml` out of the base production root. Add it through a reviewed overlay only after Cloudflare Access, DNS, origin controls, and certificates have a verified rollout sequence.
10. **Separate infrastructure delivery.** The application workflow no longer plans or applies Terraform. Keep infrastructure planning and approval in an operator-controlled platform process with protected state, least-privilege credentials, and review of the exact plan before any apply.

## Target Repository Boundaries

```text
OpsForge/                         # Product source
  backend/
  frontend/
  .github/workflows/              # Image publication and GitOps deployment PR

OpsForge-Platform/                # Cloud infrastructure and bootstrap
  bootstrap/
    state/
    identity/
    argocd/
  modules/
    network/
    kubernetes/
    data/
    observability/
  live/
    development/
    staging/
    production/

OpsForge-GitOps/                  # Sole Kubernetes desired state
  .github/
    CODEOWNERS
    workflows/validate.yml
  bootstrap/
  projects/
  clusters/
    development/
    staging/
    production/
  platform/
    base/
    overlays/
  apps/opsforge/
    base/
    overlays/
      development/
      staging/
      production/
  policies/
  tenants/
```

Keep Terraform state/bootstrap and OIDC-role administration outside the ordinary application delivery role. The regular Terraform role must not be able to modify its own role, policy, or permissions boundary.

## Delivery And Promotion Model

```text
protected source main
  -> build exact commit and publish immutable image digests
production promotion PR
  -> render manifests, require digest pins, obtain CODEOWNER approval, merge, Argo sync
```

Never rebuild an image between environments. Promote the same digest. Roll back with a Git revert to a previously deployed digest. Database changes must use backward-compatible expand/contract migrations.

The application workflow updates one stable production deployment branch and
opens or refreshes a pull request. It does not merge the pull request or contact
the cluster directly.

Run migrations once as a bounded Argo CD `PreSync` Job. Do not run Alembic independently in every API pod or in the image entrypoint.

## Recommended Managed Production Target

- EKS managed control plane across three availability zones, private managed nodes or Karpenter, Pod Identity/IRSA, and encrypted EBS CSI volumes where state is unavoidable.
- RDS PostgreSQL Multi-AZ with PITR and cross-region or cross-account backup; ElastiCache Redis.
- External Secrets Operator backed by AWS Secrets Manager; no long-lived cluster or cloud credentials in application Secrets.
- Argo CD per cluster with pinned installation versions, SSO, disabled local admin, HA replicas, restricted AppProjects, sync windows, and notifications.
- Kyverno admission policies for digest/signature verification, restricted pods, allowed registries, resource/probe requirements, and namespace isolation.
- Prometheus/OpenTelemetry application metrics, externally stored logs, Argo reconciliation alerts, black-box probes, and an alert path outside the workload cluster.
- Argo Rollouts canary or blue/green delivery with automated analysis for changes that justify progressive rollout.

## Cost-Constrained K3s Track

If EKS/RDS is not yet affordable, classify the deployment as non-HA and make these minimum improvements:

- Pin K3s, Argo CD, AMI, Helm chart, and base-image versions/digests; verify installer checksums instead of using `curl | sh` against a moving channel.
- Put persistent data on retained encrypted storage and protect the EC2 resource from accidental replacement.
- Block pod access to IMDS and give backup jobs dedicated credentials rather than the node role.
- Automate backups of PostgreSQL, K3s state, and all Sealed Secrets keys; retain encrypted copies off-node and test a full rebuild quarterly.
- Add default-deny policies, restrictive AppProjects, Pod Security `restricted`, admission policy, PDBs where meaningful, and an external dead-man monitor.

## Required Validation In The GitOps Repository

Every pull request must:

- render all Kustomize overlays;
- reject tags and require exactly the expected digest-pinned images;
- block unreviewed production changes.

## Exit Criteria

Production GitOps is ready only when:

- source and GitOps branches plus the production environment have effective protections;
- Argo CD has one documented, reproducible bootstrap path and the GitOps repository is the sole desired-state source;
- tenant repositories cannot create cluster-scoped resources or deploy outside assigned namespaces/clusters;
- application delivery has no cluster credentials, and Terraform remains separate from application delivery;
- the routine Terraform role cannot modify its own role, attached policies, or permissions boundary;
- all production images are digest-pinned;
- secrets are externalized and workload identity replaces node/static cloud credentials;
- backup freshness, restore, rollback, failed migration, Argo outage, certificate failure, and credential rotation runbooks have been exercised;
- externally measured availability and latency SLOs alert through infrastructure independent of the production cluster.
