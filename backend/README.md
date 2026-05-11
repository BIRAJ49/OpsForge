# OpsForge Backend

OpsForge is an AI-powered DevOps/Internal Developer Platform backend for GitOps, observability, security scanning, generated DevOps files, and manual self-healing workflows.

The API is designed for the existing React dashboard at `http://localhost:5173` and is served under:

```text
http://localhost:8000/api
```

## Tech Stack

- Python 3.12
- FastAPI
- PostgreSQL
- SQLAlchemy ORM
- Alembic migrations
- Pydantic validation
- JWT access tokens and database-backed refresh tokens
- bcrypt password hashing
- GitHub API and GitHub Container Registry integration adapters
- Kubernetes Python client-ready service boundary
- Argo CD API adapter
- Trivy CLI security scanning
- Rule-based incident analyzer
- Rule-based project analyzer and DevOps lifecycle generator
- Mock monitoring and logs for the MVP

## Features

- Register, login, refresh, logout
- Email verification with 6-digit codes
- Password reset with 6-digit codes
- Roles: `USER`, `ADMIN`
- Admin seeded from environment variables
- User-owned projects and admin-wide visibility
- DevOps file generation stored in PostgreSQL
- Docker, Kubernetes, Helm, GitHub Actions, Argo CD, Terraform, and README generation
- GitHub repo and GitOps repo creation adapters
- GHCR image naming and generated workflow placeholders
- Deployment records and GitOps deployment flow placeholders
- Argo CD status/sync/refresh/history endpoints
- Kubernetes resource endpoints that never expose raw secret values
- Mock monitoring and log APIs
- Incidents and rule-based AI analysis
- Manual self-healing action request, approval, and execution tracking
- Trivy scan endpoint that fails clearly if Trivy is unavailable
- Audit logging for sensitive actions
- Centralized response and error format
- Secure ZIP/GitHub project import with secret masking and generated lifecycle files

## Folder Structure

```text
backend/
  app/
    main.py
    core/
    models/
    schemas/
    api/routes/
    services/
    templates/
    utils/
    tests/
  alembic/
  Dockerfile
  docker-compose.yml
  requirements.txt
  .env.example
```

## Local Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Update `.env` with a strong `JWT_SECRET_KEY` and a non-default `ADMIN_PASSWORD`.

Run PostgreSQL locally or use Docker Compose. Then run migrations:

```bash
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API docs:

```text
http://localhost:8000/docs
```

Health check:

```bash
curl http://localhost:8000/api/health
```

## Docker Setup

```bash
cd backend
cp .env.example .env
docker compose up --build
```

This starts:

- `backend`
- `postgres`
- `redis`

The backend container runs `alembic upgrade head` before starting FastAPI.

## Admin Seed

On startup, the backend creates or updates the admin account from:

```text
ADMIN_EMAIL=birajadhikari49@gmail.com
ADMIN_PASSWORD=change-this-admin-password
ADMIN_NAME=Biraj Admin
```

The seeded admin is active, verified, and has role `ADMIN`.

## Email Codes

In development, `EMAIL_PROVIDER=console` prints verification and reset codes to terminal logs.

SMTP or Resend can be added later through environment variables. No real email provider is required locally.

## API Route Summary

Authentication:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `POST /api/auth/verify-email`
- `POST /api/auth/resend-verification-code`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `GET /api/auth/me`

Projects and files:

- `POST /api/projects`
- `GET /api/projects`
- `GET /api/projects/{project_id}`
- `PATCH /api/projects/{project_id}`
- `DELETE /api/projects/{project_id}`
- `POST /api/projects/{project_id}/generate`
- `GET /api/projects/{project_id}/generated-files`
- `GET /api/generated-files/{file_id}`
- `GET /api/generated-files/{file_id}/download`

Project analyzer:

- `POST /api/projects/upload`
- `GET /api/projects/{project_id}/upload-status`
- `POST /api/projects/import-from-github`
- `POST /api/projects/{project_id}/analyze-github-repo`
- `POST /api/projects/{project_id}/analyze`
- `GET /api/projects/{project_id}/analysis`
- `GET /api/projects/{project_id}/analysis/files`
- `POST /api/projects/{project_id}/generate-from-analysis`
- `POST /api/projects/{project_id}/regenerate-file`

## Project Analyzer Security

The analyzer never executes uploaded code. It does not run `npm install`, `pip install`, `docker build`, or arbitrary project scripts. ZIP uploads are extracted into `UPLOAD_TEMP_DIR`, path traversal entries are rejected, large uploads are rejected by `MAX_UPLOAD_SIZE_MB`, common dependency/build folders are ignored, binary and very large files are skipped, and `.env`, token, key, password, database URL, GitHub token, AWS key, and private key values are masked before analysis data is saved.

GitHub and GHCR:

- `POST /api/integrations/github/connect`
- `GET /api/integrations/github/status`
- `POST /api/projects/{project_id}/github/create-repo`
- `POST /api/projects/{project_id}/github/push-generated-files`
- `POST /api/projects/{project_id}/github/create-gitops-repo`
- `POST /api/projects/{project_id}/github/update-gitops-image`
- `POST /api/integrations/ghcr/connect`
- `GET /api/integrations/ghcr/status`
- `GET /api/projects/{project_id}/images`

Deployments and GitOps:

- `POST /api/projects/{project_id}/deploy`
- `GET /api/projects/{project_id}/deployments`
- `GET /api/deployments/{deployment_id}`
- `POST /api/deployments/{deployment_id}/restart`
- `POST /api/deployments/{deployment_id}/rollback`
- `POST /api/deployments/{deployment_id}/scale`
- `GET /api/projects/{project_id}/gitops/status`
- `POST /api/projects/{project_id}/gitops/sync`
- `POST /api/projects/{project_id}/gitops/refresh`
- `GET /api/projects/{project_id}/gitops/history`

Kubernetes, monitoring, logs:

- `GET /api/kubernetes/namespaces`
- `GET /api/kubernetes/pods`
- `GET /api/kubernetes/deployments`
- `GET /api/kubernetes/services`
- `GET /api/kubernetes/ingress`
- `GET /api/kubernetes/configmaps`
- `GET /api/kubernetes/secrets`
- `GET /api/kubernetes/hpa`
- `GET /api/kubernetes/pods/{pod_name}/logs`
- `GET /api/kubernetes/pods/{pod_name}/events`
- `GET /api/monitoring/overview`
- `GET /api/monitoring/cpu`
- `GET /api/monitoring/memory`
- `GET /api/monitoring/request-rate`
- `GET /api/monitoring/error-rate`
- `GET /api/monitoring/latency`
- `GET /api/monitoring/alerts`
- `GET /api/logs`
- `GET /api/logs/services`
- `GET /api/logs/search`

Incidents, AI, healing, security:

- `GET /api/incidents`
- `POST /api/incidents`
- `GET /api/incidents/{incident_id}`
- `PATCH /api/incidents/{incident_id}`
- `POST /api/incidents/{incident_id}/resolve`
- `POST /api/incidents/{incident_id}/rollback`
- `POST /api/incidents/{incident_id}/restart`
- `POST /api/incidents/{incident_id}/analyze`
- `GET /api/incidents/{incident_id}/ai-analysis`
- `POST /api/healing/analyze`
- `POST /api/healing/actions`
- `POST /api/healing/actions/{action_id}/approve`
- `POST /api/healing/actions/{action_id}/execute`
- `POST /api/security/scan/project/{project_id}`
- `GET /api/security/scans`
- `GET /api/security/scans/{scan_id}`

Admin:

- `GET /api/admin/users`
- `PATCH /api/admin/users/{user_id}/role`
- `PATCH /api/admin/users/{user_id}/disable`
- `GET /api/admin/projects`
- `GET /api/admin/deployments`
- `GET /api/admin/incidents`
- `GET /api/admin/audit-logs`
- `GET /api/admin/system-health`
- `GET /api/admin/settings`

## GitHub Integration Setup

Set:

```text
GITHUB_TOKEN=
GITHUB_USERNAME=BIRAJ49
GITHUB_DEFAULT_BRANCH=main
GITHUB_PROJECT_REPO_FORMAT=opsforge-{project-name}
GITHUB_GITOPS_REPO=opsforge-gitops
```

The API never returns the raw token. If no token is configured, GitHub endpoints return `requires_token`.

## GHCR Setup

Set:

```text
GHCR_USERNAME=BIRAJ49
GHCR_TOKEN=
GHCR_IMAGE_FORMAT=ghcr.io/BIRAJ49/{project-name}:{tag}
```

Generated GitHub Actions use placeholder secrets:

- `GHCR_USERNAME`
- `GHCR_TOKEN`
- `GITOPS_REPO_TOKEN`

## k3d Setup

Example local cluster:

```bash
k3d cluster create opsforge --agents 2
kubectl create namespace opsforge
```

Default expected context:

```text
KUBERNETES_CONTEXT=opsforge-k3d
KUBERNETES_DEFAULT_NAMESPACE=opsforge
```

Kubernetes secret endpoints only return metadata and masked values.

## Argo CD Setup

Expected values:

```text
ARGOCD_NAMESPACE=argocd
ARGOCD_APP_FORMAT={project-name}-{environment}
ARGOCD_AUTO_SYNC=true
ARGOCD_PRUNE=true
ARGOCD_SELF_HEAL=true
```

If `ARGOCD_SERVER` and `ARGOCD_TOKEN` are not configured, Argo CD endpoints return `requires_token` or `not_connected`.

## Trivy Setup

Install Trivy and ensure it is available on `PATH`, or set:

```text
TRIVY_PATH=/path/to/trivy
TRIVY_ENABLED=true
```

If Trivy is not installed or disabled, scan endpoints return:

```text
Trivy is not installed or TRIVY_ENABLED=false
```

## Example Requests

Register:

```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Dev User","email":"dev@example.com","password":"change-me-123"}'
```

Login:

```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"birajadhikari49@gmail.com","password":"change-this-admin-password"}'
```

Create project:

```bash
curl -X POST http://localhost:8000/api/projects \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"payments-api","app_type":"fullstack","stack":"React + FastAPI + PostgreSQL + Redis","deployment_type":"gitops","environment":"dev"}'
```

Generate files:

```bash
curl -X POST http://localhost:8000/api/projects/1/generate \
  -H "Authorization: Bearer <access_token>"
```

Analyze incident:

```bash
curl -X POST http://localhost:8000/api/incidents/1/analyze \
  -H "Authorization: Bearer <access_token>"
```

## Current Limitations

- Monitoring and logs are mock services.
- Kubernetes resource endpoints are safe mock/configurable adapters unless kubeconfig support is extended.
- GitHub, GHCR, and Argo CD integrations return placeholder statuses when secrets are absent.
- Trivy scans require the local Trivy CLI.
- Secret encryption at rest is marked as an extension point; raw secrets are never returned by API responses.
- Healing execution records actions but does not automatically mutate clusters by default.

## Future Improvements

- Add encrypted secret storage with KMS or Vault.
- Add Prometheus and Loki adapters.
- Add real Kubernetes execution for approved healing actions.
- Add background workers for long-running scans and deployments.
- Add Bedrock/OpenRouter/Gemini/OpenAI incident analysis adapters behind the existing AI service interface.
- Add OAuth GitHub App support.
- Add full Argo CD application lifecycle management.
