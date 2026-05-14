from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.project_analysis import AnalysisFileSummary, ProjectAnalysis
from app.services.ai_service import suggest_project_profile
from app.services.devops_recommendation_service import build_recommendations
from app.services.secret_scanner_service import masked_env_vars, scan_text_for_secrets
from app.services.stack_detector_service import is_ignored_path, safe_read_text, detect_project


IMPORTANT_NAMES = {"package.json", "requirements.txt", "pyproject.toml", "Dockerfile", "docker-compose.yml", ".env", "vite.config.js", "main.py", "app.py"}


def analyze_project_path(db: Session, project_id: int, owner_id: int, root: Path) -> ProjectAnalysis:
    detection = detect_project(root)
    env_vars: dict[str, str] = {}
    warnings: list[str] = []
    summaries: list[AnalysisFileSummary] = []
    for path in root.rglob("*"):
        if not path.is_file() or is_ignored_path(path.relative_to(root)):
            continue
        if path.stat().st_size > 300_000:
            continue
        rel = path.relative_to(root).as_posix()
        text = safe_read_text(path)
        if not text and path.stat().st_size:
            continue
        _masked, found = scan_text_for_secrets(text, rel)
        warnings.extend(found)
        if path.name.startswith(".env") or "env" in path.name.lower():
            env, env_warnings = masked_env_vars(text, rel)
            env_vars.update(env)
            warnings.extend(env_warnings)
        if path.name in IMPORTANT_NAMES or rel.startswith((".github/workflows/", "k8s/", "helm/", "terraform/", "argocd/")):
            summaries.append(AnalysisFileSummary(file_path=rel, file_type=_file_type(rel), language=_language(rel), summary=_summary_for(rel), important=True))

    detection["detected_env_vars"] = env_vars
    detection["security_warnings"] = sorted(set(warnings))
    detection["important_files"] = [{"path": item.file_path, "type": item.file_type, "language": item.language} for item in summaries[:30]]
    profile = build_project_profile(detection)
    ai_diagnostics: dict = {}
    ai_profile = suggest_project_profile(detection, profile, ai_diagnostics)
    detection["project_profile"] = ai_profile or {**profile, "ai_assisted": False}
    detection["project_profile_ai"] = ai_diagnostics
    recs = build_recommendations(detection)
    data = {**detection, **recs}

    db.execute(delete(AnalysisFileSummary).where(AnalysisFileSummary.analysis_id.in_(select(ProjectAnalysis.id).where(ProjectAnalysis.project_id == project_id))))
    db.execute(delete(ProjectAnalysis).where(ProjectAnalysis.project_id == project_id))
    analysis = ProjectAnalysis(project_id=project_id, owner_id=owner_id, analysis_json=data, **{k: data[k] for k in [
        "detected_project_type", "detected_stack", "frontend_path", "backend_path", "package_manager",
        "build_commands", "start_commands", "detected_ports", "detected_databases", "detected_cache",
        "detected_env_vars", "existing_devops_files", "missing_devops_files", "recommended_files",
        "recommended_deployment_strategy", "risk_score", "security_warnings",
    ]})
    analysis.files = summaries
    db.add(analysis)
    db.flush()
    return analysis


def latest_analysis(db: Session, project_id: int) -> ProjectAnalysis | None:
    return db.scalar(select(ProjectAnalysis).where(ProjectAnalysis.project_id == project_id).order_by(ProjectAnalysis.created_at.desc()))


def build_project_profile(analysis: dict) -> dict:
    ports = analysis.get("detected_ports") or {}
    start_commands = analysis.get("start_commands") or {}
    build_commands = analysis.get("build_commands") or {}
    stack = analysis.get("detected_stack") or []
    frontend_path = analysis.get("frontend_path") or ""
    backend_path = analysis.get("backend_path") or ""
    env_vars = sorted((analysis.get("detected_env_vars") or {}).keys())

    frontend = {
        "enabled": bool(frontend_path),
        "framework": _first_match(stack, ["React", "Next.js", "Vue", "Angular", "Vite", "Frontend"]) or "",
        "root": frontend_path,
        "package_manager": _node_package_manager(analysis.get("package_manager")),
        "install_command": _node_install_command(analysis.get("package_manager")),
        "build_command": build_commands.get("frontend", "npm run build") if frontend_path else "",
        "start_command": start_commands.get("frontend", "nginx -g 'daemon off;'") if frontend_path else "",
        "output_dir": "dist" if "Vite" in stack or "React" in stack else ".next" if "Next.js" in stack else "",
        "port": int(ports.get("frontend") or 80),
    }
    backend = {
        "enabled": bool(backend_path),
        "framework": _first_match(stack, ["FastAPI", "Django", "Flask", "Express", "NestJS", "Go", "Java Maven", "Java Gradle"]) or "",
        "root": backend_path,
        "package_manager": _backend_package_manager(analysis.get("package_manager"), stack),
        "install_command": build_commands.get("backend", _default_backend_install(stack)),
        "start_command": start_commands.get("backend", _default_backend_start(stack)),
        "port": int(ports.get("backend") or ports.get("detected") or 8000),
        "health_path": "/health",
    }
    return {
        "project_type": analysis.get("detected_project_type", "unknown"),
        "confidence": _profile_confidence(analysis),
        "frontend": frontend,
        "backend": backend,
        "databases": analysis.get("detected_databases") or [],
        "cache": analysis.get("detected_cache") or [],
        "environment_variables": env_vars,
        "notes": _profile_notes(analysis),
    }


def _first_match(values: list[str], candidates: list[str]) -> str | None:
    return next((item for item in candidates if item in values), None)


def _node_package_manager(value: str | None) -> str:
    value = value or ""
    if "pnpm" in value:
        return "pnpm"
    if "yarn" in value:
        return "yarn"
    return "npm"


def _node_install_command(value: str | None) -> str:
    manager = _node_package_manager(value)
    return "pnpm install --frozen-lockfile" if manager == "pnpm" else "yarn install --frozen-lockfile" if manager == "yarn" else "npm ci"


def _backend_package_manager(value: str | None, stack: list[str]) -> str:
    value = value or ""
    if "poetry" in value:
        return "poetry"
    if "maven" in value:
        return "maven"
    if "gradle" in value:
        return "gradle"
    if "go modules" in value:
        return "go"
    if any(item in stack for item in ["Express", "NestJS"]):
        return _node_package_manager(value)
    return "pip"


def _default_backend_install(stack: list[str]) -> str:
    if any(item in stack for item in ["Express", "NestJS"]):
        return "npm ci"
    if "Java Maven" in stack:
        return "mvn package -DskipTests"
    if "Java Gradle" in stack:
        return "./gradlew build -x test"
    if "Go" in stack:
        return "go mod download"
    return "pip install -r requirements.txt"


def _default_backend_start(stack: list[str]) -> str:
    if "FastAPI" in stack:
        return "uvicorn app.main:app --host 0.0.0.0 --port 8000"
    if "Django" in stack:
        return "python manage.py runserver 0.0.0.0:8000"
    if "Flask" in stack:
        return "flask run --host 0.0.0.0 --port 5000"
    if any(item in stack for item in ["Express", "NestJS"]):
        return "npm start"
    return ""


def _profile_confidence(analysis: dict) -> str:
    score = 0
    score += 1 if analysis.get("frontend_path") else 0
    score += 1 if analysis.get("backend_path") else 0
    score += 1 if analysis.get("start_commands") else 0
    score += 1 if analysis.get("detected_ports") else 0
    return "high" if score >= 3 else "medium" if score >= 2 else "low"


def _profile_notes(analysis: dict) -> list[str]:
    notes = []
    if not analysis.get("frontend_path"):
        notes.append("Frontend root was not confidently detected.")
    if not analysis.get("backend_path"):
        notes.append("Backend root was not confidently detected.")
    if not analysis.get("start_commands"):
        notes.append("Start command should be reviewed before generating deployment files.")
    if not analysis.get("detected_ports"):
        notes.append("Runtime ports were inferred from framework defaults.")
    return notes


def _file_type(path: str) -> str:
    if path.endswith("package.json"):
        return "node"
    if path.endswith(("requirements.txt", "pyproject.toml", ".py")):
        return "python"
    if path.startswith(".github/workflows/"):
        return "github_actions"
    if path.startswith("k8s/"):
        return "kubernetes"
    if path.startswith("helm/"):
        return "helm"
    if path.startswith("terraform/"):
        return "terraform"
    return "config"


def _language(path: str) -> str:
    suffix = Path(path).suffix
    return {".json": "JSON", ".py": "Python", ".js": "JavaScript", ".ts": "TypeScript", ".yaml": "YAML", ".yml": "YAML", ".tf": "HCL"}.get(suffix, "Text")


def _summary_for(path: str) -> str:
    name = Path(path).name
    if name == "package.json":
        return "Node project metadata and dependency manifest"
    if name == "requirements.txt":
        return "Python dependency manifest"
    if name.startswith(".env"):
        return "Environment values detected and masked"
    return "Important project or DevOps file detected during analysis"
