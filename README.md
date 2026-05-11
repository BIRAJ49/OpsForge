# OpsForge

OpsForge is organized as a full-stack project:

- `frontend/` - React, Vite, Tailwind dashboard
- `backend/` - FastAPI backend/API

## Run Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend URL:

```text
http://localhost:5173
```

## Run Backend

```bash
cd backend
cp .env.example .env
docker compose up --build
```

Backend API URL:

```text
http://localhost:8000/api
```

For local non-Docker development, see `backend/README.md`.

## AI Project Analyzer

Authenticated users can open `/app/upload-project` to upload a project ZIP or import a GitHub repository. OpsForge safely scans metadata only, masks secrets, detects stack/runtime details, and generates Docker, Compose, GitHub Actions, Kubernetes, Helm, Argo CD, Terraform, security, deployment-plan, risk-report, and README files into the existing Generated Files workflow.

Analyzer defaults are rule-based and do not require a paid AI provider:

```text
PROJECT_ANALYZER_MODE=rule_based
AI_PROVIDER=rule_based
MAX_UPLOAD_SIZE_MB=50
UPLOAD_TEMP_DIR=/tmp/opsforge-uploads
DELETE_UPLOAD_AFTER_ANALYSIS=true
ALLOW_GITHUB_IMPORT=true
ALLOW_ZIP_UPLOAD=true
```
