from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.generated_file import GeneratedFile
from app.models.project import Project
from app.models.project_analysis import ProjectAnalysis
from app.services.namespace_service import user_app_namespace


def generate_from_analysis(db: Session, project: Project, analysis: ProjectAnalysis, options: dict | None = None, github_username: str | None = None) -> list[GeneratedFile]:
    options = options or {}
    specs = build_analysis_files(project, analysis, options, github_username)
    db.execute(delete(GeneratedFile).where(GeneratedFile.project_id == project.id))
    files = [GeneratedFile(project_id=project.id, **spec) for spec in specs]
    db.add_all(files)
    db.flush()
    return files


def regenerate_one_file(db: Session, project: Project, analysis: ProjectAnalysis, file_path: str, github_username: str | None = None) -> GeneratedFile:
    specs = {spec["file_path"]: spec for spec in build_analysis_files(project, analysis, {}, github_username)}
    if file_path not in specs:
        raise ValueError("Unsupported generated file")
    existing = next((f for f in project.generated_files if f.file_path == file_path), None)
    spec = specs[file_path]
    if existing:
        for key, value in spec.items():
            setattr(existing, key, value)
        db.flush()
        return existing
    generated = GeneratedFile(project_id=project.id, **spec)
    db.add(generated)
    db.flush()
    return generated


def build_analysis_files(project: Project, analysis: ProjectAnalysis, options: dict, github_username: str | None = None) -> list[dict[str, str]]:
    app = project.name
    env = project.environment.value
    namespace = user_app_namespace(env, project.namespace)
    frontend_path = analysis.frontend_path or "frontend"
    backend_path = analysis.backend_path or "backend"
    owner = github_username or settings.GHCR_USERNAME
    frontend_image = f"ghcr.io/{owner}/{app}-frontend:latest"
    backend_image = f"ghcr.io/{owner}/{app}-backend:latest"
    backend_start = (analysis.start_commands or {}).get("backend", "uvicorn app.main:app --host 0.0.0.0 --port 8000")
    return [
        _file("Dockerfile.frontend", f"{frontend_path}/Dockerfile", "docker", "FROM node:22-alpine AS build\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nRUN npm run build\n\nFROM nginx:1.27-alpine\nCOPY --from=build /app/dist /usr/share/nginx/html\nEXPOSE 80\nCMD [\"nginx\", \"-g\", \"daemon off;\"]\n"),
        _file("Dockerfile.backend", f"{backend_path}/Dockerfile", "docker", f"FROM python:3.12-slim\nENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1\nWORKDIR /app\nCOPY requirements.txt ./\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY . .\nEXPOSE 8000\nCMD {backend_start.split()!r}\n"),
        _file("docker-compose.yml", "docker-compose.yml", "compose", f"services:\n  frontend:\n    build: ./{frontend_path}\n    ports: [\"5173:80\"]\n    depends_on: [backend]\n  backend:\n    build: ./{backend_path}\n    env_file: .env\n    ports: [\"8000:8000\"]\n    depends_on:\n      postgres:\n        condition: service_healthy\n      redis:\n        condition: service_started\n  postgres:\n    image: postgres:16-alpine\n    environment:\n      POSTGRES_DB: {app}\n      POSTGRES_USER: postgres\n      POSTGRES_PASSWORD: postgres\n    volumes: [\"postgres-data:/var/lib/postgresql/data\"]\n    healthcheck:\n      test: [\"CMD-SHELL\", \"pg_isready -U postgres\"]\n      interval: 10s\n      timeout: 5s\n      retries: 5\n  redis:\n    image: redis:7-alpine\nvolumes:\n  postgres-data:\n"),
        _file(".env.example", ".env.example", "env", "DATABASE_URL=postgresql://postgres:postgres@postgres:5432/app\nREDIS_URL=redis://redis:6379/0\nJWT_SECRET_KEY=replace-with-secure-secret\nAPI_KEY=replace-with-provider-key\n"),
        _file("ci-cd.yml", ".github/workflows/ci-cd.yml", "github_actions", f"name: OpsForge CI/CD\non:\n  push:\n    branches: [main]\njobs:\n  build-test-push:\n    runs-on: ubuntu-latest\n    permissions:\n      contents: write\n      packages: write\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n      - name: Frontend build\n        working-directory: {frontend_path}\n        run: npm ci && npm run build\n      - uses: actions/setup-python@v5\n        with:\n          python-version: '3.12'\n      - name: Backend tests\n        working-directory: {backend_path}\n        run: |\n          pip install -r requirements.txt\n          test -d tests && pytest || echo \"No backend tests directory found\"\n      - uses: docker/login-action@v3\n        with:\n          registry: ghcr.io\n          username: ${{{{ github.actor }}}}\n          password: ${{{{ secrets.GITHUB_TOKEN }}}}\n      - name: Build and push images\n        run: |\n          docker build -t {frontend_image} {frontend_path}\n          docker build -t {backend_image} {backend_path}\n          docker push {frontend_image}\n          docker push {backend_image}\n      - name: Trivy filesystem scan\n        uses: aquasecurity/trivy-action@master\n        with:\n          scan-type: fs\n          scan-ref: .\n"),
        _file("namespace.yaml", "k8s/namespace.yaml", "kubernetes", f"apiVersion: v1\nkind: Namespace\nmetadata:\n  name: {namespace}\n"),
        _file("backend-deployment.yaml", "k8s/backend-deployment.yaml", "kubernetes", _deployment(app, "backend", namespace, backend_image, 8000)),
        _file("frontend-deployment.yaml", "k8s/frontend-deployment.yaml", "kubernetes", _deployment(app, "frontend", namespace, frontend_image, 80)),
        _file("services.yaml", "k8s/services.yaml", "kubernetes", f"apiVersion: v1\nkind: Service\nmetadata:\n  name: {app}-backend\n  namespace: {namespace}\nspec:\n  selector:\n    app: {app}-backend\n  ports:\n    - port: 8000\n      targetPort: 8000\n---\napiVersion: v1\nkind: Service\nmetadata:\n  name: {app}-frontend\n  namespace: {namespace}\nspec:\n  selector:\n    app: {app}-frontend\n  ports:\n    - port: 80\n      targetPort: 80\n"),
        _file("postgres-redis.yaml", "k8s/postgres-redis.yaml", "kubernetes", f"apiVersion: apps/v1\nkind: StatefulSet\nmetadata:\n  name: {app}-postgres\n  namespace: {namespace}\nspec:\n  serviceName: {app}-postgres\n  replicas: 1\n  selector:\n    matchLabels:\n      app: {app}-postgres\n  template:\n    metadata:\n      labels:\n        app: {app}-postgres\n    spec:\n      containers:\n        - name: postgres\n          image: postgres:16-alpine\n          envFrom:\n            - secretRef:\n                name: {app}-secret\n---\napiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: {app}-redis\n  namespace: {namespace}\nspec:\n  selector:\n    matchLabels:\n      app: {app}-redis\n  template:\n    metadata:\n      labels:\n        app: {app}-redis\n    spec:\n      containers:\n        - name: redis\n          image: redis:7-alpine\n"),
        _file("configmap-secret.yaml", "k8s/configmap-secret.yaml", "kubernetes", f"apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: {app}-config\n  namespace: {namespace}\ndata:\n  APP_ENV: {env}\n  REDIS_URL: redis://{app}-redis:6379/0\n---\napiVersion: v1\nkind: Secret\nmetadata:\n  name: {app}-secret\n  namespace: {namespace}\ntype: Opaque\nstringData:\n  DATABASE_URL: replace-with-database-url\n  POSTGRES_PASSWORD: replace-with-secure-password\n  JWT_SECRET_KEY: replace-with-secure-secret\n"),
        _file("ingress-hpa.yaml", "k8s/ingress-hpa.yaml", "kubernetes", f"apiVersion: networking.k8s.io/v1\nkind: Ingress\nmetadata:\n  name: {app}\n  namespace: {namespace}\nspec:\n  ingressClassName: nginx\n  rules:\n    - host: {app}.local\n      http:\n        paths:\n          - path: /\n            pathType: Prefix\n            backend:\n              service:\n                name: {app}-frontend\n                port:\n                  number: 80\n---\napiVersion: autoscaling/v2\nkind: HorizontalPodAutoscaler\nmetadata:\n  name: {app}-backend\n  namespace: {namespace}\nspec:\n  scaleTargetRef:\n    apiVersion: apps/v1\n    kind: Deployment\n    name: {app}-backend\n  minReplicas: 2\n  maxReplicas: 8\n  metrics:\n    - type: Resource\n      resource:\n        name: cpu\n        target:\n          type: Utilization\n          averageUtilization: 70\n"),
        _file("Chart.yaml", "helm/Chart.yaml", "helm", f"apiVersion: v2\nname: {app}\ndescription: OpsForge generated Helm chart\nversion: 0.1.0\nappVersion: 0.1.0\n"),
        _file("values.yaml", "helm/values.yaml", "helm", f"namespace: {namespace}\nfrontend:\n  image: {frontend_image}\nbackend:\n  image: {backend_image}\nreplicaCount: 2\ningress:\n  host: {app}.local\n"),
        _file("templates/all.yaml", "helm/templates/all.yaml", "helm", "{{- /* See k8s manifests for expanded resources. Keep values synced here before production use. */ -}}\n"),
        _file("application.yaml", "argocd/application.yaml", "argocd", f"apiVersion: argoproj.io/v1alpha1\nkind: Application\nmetadata:\n  name: {app}-{env}\n  namespace: {settings.ARGOCD_NAMESPACE}\nspec:\n  project: default\n  source:\n    repoURL: https://github.com/{owner}/{settings.GITHUB_GITOPS_REPO}.git\n    targetRevision: main\n    path: apps/{app}/{env}\n  destination:\n    server: https://kubernetes.default.svc\n    namespace: {namespace}\n  syncPolicy:\n    automated:\n      prune: true\n      selfHeal: true\n"),
        _file("main.tf", "terraform/main.tf", "terraform", "resource \"aws_security_group\" \"k3s\" {\n  name        = \"opsforge-k3s\"\n  description = \"K3s starter access\"\n}\n\nresource \"aws_instance\" \"k3s\" {\n  ami           = var.ami_id\n  instance_type = var.instance_type\n  key_name      = var.key_pair_name\n  vpc_security_group_ids = [aws_security_group.k3s.id]\n}\n\nresource \"aws_s3_bucket\" \"artifacts\" {\n  bucket = var.artifact_bucket_name\n}\n"),
        _file("variables.tf", "terraform/variables.tf", "terraform", "variable \"aws_region\" { default = \"replace-with-aws-region\" }\nvariable \"ami_id\" { default = \"replace-with-ami-id\" }\nvariable \"instance_type\" { default = \"t3.medium\" }\nvariable \"key_pair_name\" { default = \"replace-with-key-pair\" }\nvariable \"artifact_bucket_name\" { default = \"replace-with-unique-bucket\" }\n"),
        _file("trivy.yaml", "security/trivy.yaml", "security", "scan:\n  scanners:\n    - vuln\n    - secret\n    - misconfig\nseverity:\n  - HIGH\n  - CRITICAL\n"),
        _file("README.md", "README.md", "docs", f"# {project.name}\n\nGenerated by OpsForge from project analysis.\n\n## Stack\n{', '.join(analysis.detected_stack)}\n\n## Local Docker Compose\n\n```bash\ndocker compose up --build\n```\n\n## GitHub Actions and GHCR\n\nThe generated workflow uses GitHub Actions `GITHUB_TOKEN` to publish images to GHCR in the connected GitHub account. Add `GITOPS_REPO_TOKEN` only when updating a separate GitOps repository.\n\n## k3d and Argo CD\n\n```bash\nk3d cluster create opsforge\nkubectl apply -f k8s/\nkubectl apply -f argocd/application.yaml\n```\n\n## Security\n\nRun Trivy before deployment and replace all placeholder secrets.\n\n## Deployment Plan\n\nStrategy: {analysis.recommended_deployment_strategy}\nRisk score: {analysis.risk_score}\n"),
        _file("deployment-plan.md", "docs/deployment-plan.md", "docs", f"# Deployment Plan\n\nEnvironment: {env}\nTarget namespace: {namespace}\nStrategy: {analysis.recommended_deployment_strategy}\n\n1. Review generated files.\n2. Configure secrets.\n3. Build and push GHCR images.\n4. Apply GitOps manifests.\n5. Validate probes, logs, and security scan results.\n"),
        _file("risk-report.md", "docs/risk-report.md", "docs", f"# Risk Report\n\nRisk score: {analysis.risk_score}\n\nWarnings:\n" + "\n".join(f"- {item}" for item in analysis.security_warnings)),
    ]


def _file(file_name: str, file_path: str, file_type: str, content: str) -> dict[str, str]:
    return {"file_name": file_name, "file_path": file_path, "file_type": file_type, "content": content}


def _deployment(app: str, component: str, namespace: str, image: str, port: int) -> str:
    return f"apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: {app}-{component}\n  namespace: {namespace}\nspec:\n  replicas: 2\n  selector:\n    matchLabels:\n      app: {app}-{component}\n  template:\n    metadata:\n      labels:\n        app: {app}-{component}\n    spec:\n      containers:\n        - name: {component}\n          image: {image}\n          ports:\n            - containerPort: {port}\n          resources:\n            requests:\n              cpu: 100m\n              memory: 128Mi\n            limits:\n              cpu: 500m\n              memory: 512Mi\n          readinessProbe:\n            tcpSocket:\n              port: {port}\n            initialDelaySeconds: 10\n            periodSeconds: 10\n          livenessProbe:\n            tcpSocket:\n              port: {port}\n            initialDelaySeconds: 30\n            periodSeconds: 20\n"
