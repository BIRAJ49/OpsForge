# Production Platform

OpsForge uses a production-style, single-node GitOps platform. It provides repeatable delivery, security controls, monitoring, and recovery without claiming multi-AZ availability.

## Architecture

```mermaid
flowchart LR
  User --> CF[Cloudflare edge and Access]
  CF -->|Cloudflare IPs only| NGINX[ingress-nginx on EC2/K3s]
  NGINX --> App[OpsForge frontend and backend]
  NGINX --> Grafana
  NGINX --> Argo[Argo CD]
  App --> Postgres
  App --> Redis
  Alloy --> Loki
  Prometheus --> Grafana
  Argo --> GitOps[OpsForge-GitOps]
  Actions[GitHub Actions] --> GHCR
  Actions -->|promotion PR| GitOps
  Terraform --> AWS[AWS networking, EC2, IAM, S3, budgets]
  Terraform --> CF
```

Public endpoints:

- `https://opsforge.birajadhikari49.com.np`
- `https://grafana.birajadhikari49.com.np` through Cloudflare Access
- `https://argocd.birajadhikari49.com.np` through Cloudflare Access

Prometheus, Loki, Alertmanager, PostgreSQL, Redis, the Kubernetes API, and internal services have no public DNS records.

## Delivery

Application pull requests run backend lint/tests/dependency auditing, frontend audit/lint/build, CodeQL, workflow/Terraform/Kustomize/Compose validation, secret/IaC scanning, and non-publishing container scans. The exact merge commit repeats the quality gates, builds each release image once, scans that artifact, creates its CycloneDX SBOM, publishes it, and attaches GitHub OIDC-backed attestations. A repository-scoped GitHub App can then open a digest promotion PR in `OpsForge-GitOps`. Production promotion requires review; Argo CD deploys only merged Git state.

Terraform pull requests run credential-free format and validation checks. Trusted `main`, scheduled, and manually dispatched runs use a read-only OIDC role for production plans. Production applies require a `workflow_dispatch` from `main`, the explicit `production` confirmation, a separate OIDC role, and approval through the protected GitHub `production` environment. State is encrypted and locked in private, versioned S3.

The OIDC provider and roles have a one-time bootstrap dependency: create them with authenticated local Terraform first. After their ARN outputs are saved as repository variables, all later plans and applies use short-lived OIDC credentials.

## Objectives And Limits

- PostgreSQL backup RPO: 24 hours or better.
- Documented rebuild RTO: 2 hours.
- This environment has one EC2 node, local-path volumes, and no automatic AZ failover.
- A node or AZ failure causes downtime until recovery.
- The future HA path is EKS across multiple AZs, RDS Multi-AZ, ElastiCache, and object-backed observability.

## Required Repository Configuration

Create `BIRAJ49/OpsForge-GitOps` and seed the one-time, production-only migration scaffold with two already published image digests:

```bash
scripts/bootstrap-gitops-repository.sh ../OpsForge-GitOps \
  ghcr.io/biraj49/opsforge-backend@sha256:<64-hex-digest> \
  ghcr.io/biraj49/opsforge-frontend@sha256:<64-hex-digest>
```

The helper creates `CODEOWNERS`, a validation workflow, and digest-pinned state. It is not the final multi-environment repository design: migrate to the layout in `gitops-production-roadmap.md` and stop maintaining the source-repository copy. Protect GitOps `main` with `Render and scan manifests` required, at least one CODEOWNER approval, stale-review dismissal, and no administrator bypass. Do not automatically merge production promotions.

Create a repository-scoped GitHub App installed only on `OpsForge-GitOps` with Contents and Pull requests read/write. Add `GITOPS_APP_CLIENT_ID` and `GITOPS_APP_PRIVATE_KEY` to the application repository secrets. Keep `ENABLE_GITOPS_PROMOTION` unset until every blocker and exit criterion in `gitops-production-roadmap.md` is complete, including staged promotion and restricted Argo/RBAC boundaries.

Protect this repository's `main` branch with the stable CI job names from `.github/workflows/opsforge-ci-cd.yml`. Create the `production` GitHub environment with required reviewer approval, a `main`-only deployment branch policy, and administrator bypass disabled. Only after those rules are effective, set `ENABLE_TERRAFORM_APPLY=true`; the apply job deliberately fails closed while it is absent. Add Terraform repository variables listed in `infra/terraform/terraform.tfvars.example` and the two OIDC role ARN variables. Use a read-only Cloudflare token named `CLOUDFLARE_API_TOKEN` at repository scope for trusted-main plans, and override it with a write-capable secret of the same name only in the protected `production` environment. Keep the default `GITHUB_TOKEN` permission read-only and allow only approved, full-SHA-pinned actions.

## External Uptime

The separate `Production synthetic check` workflow checks `https://opsforge.birajadhikari49.com.np/api/health` every fifteen minutes from outside the cluster. Its result cannot turn an otherwise successful build or Terraform apply red. Enable failed-workflow notifications and configure Cloudflare to permit this health endpoint. Replace the workflow with an independent synthetic-monitoring service and external alert path before relying on this platform for a production SLO.
