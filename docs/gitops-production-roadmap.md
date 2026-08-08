# GitOps Production Roadmap

## Decision

The current EC2/K3s platform is a useful low-cost, non-HA deployment. It should not be described as an industry-standard highly available production platform: the application, Argo CD, ingress, PostgreSQL, Redis, monitoring, and persistent volumes share one node and one availability zone.

Keep K3s only when that availability limit is an explicit business decision. For a conventional production target, use managed Kubernetes across multiple availability zones, managed PostgreSQL and Redis, workload identity, an external secret store, policy enforcement, and a dedicated workload cluster for user-generated applications.

## Blockers Before Enabling Production Promotion

1. **Establish Git and approval boundaries.** Protect `main` in the source, platform, and GitOps repositories. Require the current CI checks, CODEOWNER approval for production, stale-review dismissal, conversation resolution, and no administrator bypass. Protect the GitHub `production` environment with reviewers and a `main`-only deployment policy.
2. **Create the real GitOps source of truth.** `BIRAJ49/OpsForge-GitOps` does not currently exist. The bootstrap helper can create a digest-pinned, production-only migration scaffold, but that copy is not the target architecture. Move Kubernetes desired state into the multi-environment repository below, validate it, and bootstrap Argo CD from it before setting `ENABLE_GITOPS_PROMOTION=true`. Do not maintain copied platform manifests in two repositories.
3. **Restrict Argo CD tenants.** Stop using the unrestricted `default` AppProject for generated applications. Define separate `platform`, `opsforge`, and `tenant` AppProjects with exact source repositories, namespace destinations, and resource-kind allowlists. Put user-controlled workloads in a separate sandbox cluster/account before accepting untrusted repositories.
4. **Remove direct cluster mutation from the web API.** The backend currently has cluster-wide update/patch permissions for workloads and Argo resources. Observability should be read-only; deployments, restarts, and application registration should become reviewed Git changes. Use namespace-scoped operational roles only for explicitly approved break-glass actions.
5. **Close the node-credential path.** Pods can reach EC2 instance metadata while the node role can access backups and SSM. Move backup access to EKS Pod Identity/IRSA (or another workload identity), block `169.254.169.254` from workloads, and enforce default-deny policies in every tenant namespace.
6. **Fix secret handling.** Move deployment secrets to AWS Secrets Manager with External Secrets Operator and workload identity. Encrypt existing database-stored integration tokens with KMS-backed envelope encryption and rotate them. Never emit verification or reset codes to production logs.
7. **Make data recoverable before making compute replaceable.** The current AMI selection can replace the only node while PostgreSQL uses node-local storage. Pin approved machine/K3s versions, move PostgreSQL to RDS Multi-AZ with PITR, move Redis to ElastiCache, and run automated restore tests. If K3s remains, use retained encrypted EBS volumes and tested off-node cluster/data backups.
8. **Enforce immutable, verified workloads.** Production overlays must contain image digests, not `latest` or mutable SHA tags. Require both expected OpsForge images, verify their attestations in CI, and enforce allowed registries, digest pinning, signatures, restricted pod settings, probes, resource limits, and NetworkPolicies with Kyverno or Gatekeeper.
9. **Gate administrative ingress.** Keep `applications/platform-access.yaml` out of the base production root. Add it through a reviewed overlay only after Cloudflare Access, DNS, origin controls, and certificates have a verified rollout sequence.
10. **Review the exact infrastructure plan.** The application workflow performs credential-free Terraform format and validation only. Run production plan/apply in a separate operator-controlled infrastructure process with protected state, least-privilege credentials, review of the exact plan, and no ability for the routine role to escalate its own permissions. Move to HCP Terraform, Atlantis, or organization-controlled plan storage if stronger custody, audit, or retention controls are required.

## Target Repository Boundaries

```text
OpsForge/                         # Product source
  backend/
  frontend/
  .github/workflows/              # PR CI/security, image release, and GitOps promotion

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
pull request
  -> tests, lint, SAST, dependency/secret/IaC checks, manifest render, container scan
protected main
  -> rebuild exact commit, scan, SBOM, provenance attestation, publish immutable digest
development promotion PR
  -> automatic merge after policy and smoke tests
staging promotion PR
  -> integration/e2e and migration checks using the same digest
production promotion PR
  -> CODEOWNER approval, change window, Argo sync, post-sync verification
```

Never rebuild an image between environments. Promote the same digest and attestations. Roll back with a Git revert to a previously verified digest. Database changes must use backward-compatible expand/contract migrations.

The current application workflow's direct production promotion is deliberately feature-flagged. Keep it disabled until development and staging overlays exist; then change the updater to promote the same digest through those environments before it can target production.

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
- schema-validate built-in Kubernetes resources and validate CRDs against pinned schemas;
- run secret and policy scans;
- reject tags and require exactly the expected digest-pinned images;
- verify image provenance/attestations;
- enforce namespace, AppProject, RBAC, resource, probe, and NetworkPolicy rules;
- show the rendered diff and block unreviewed production changes.

## Exit Criteria

Production GitOps is ready only when:

- source and GitOps branches plus the production environment have effective protections;
- Argo CD has one documented, reproducible bootstrap path and the GitOps repository is the sole desired-state source;
- tenant repositories cannot create cluster-scoped resources or deploy outside assigned namespaces/clusters;
- application delivery has no cluster credentials, and Terraform plan/apply remains outside the application workflow;
- the routine Terraform role cannot modify its own role, attached policies, or permissions boundary;
- all production images are digest-pinned and verified at CI and admission;
- secrets are externalized and workload identity replaces node/static cloud credentials;
- backup freshness, restore, rollback, failed migration, Argo outage, certificate failure, and credential rotation runbooks have been exercised;
- externally measured availability and latency SLOs alert through infrastructure independent of the production cluster.
