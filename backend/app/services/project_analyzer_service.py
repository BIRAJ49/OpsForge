from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.project_analysis import AnalysisFileSummary, ProjectAnalysis
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
