import json
import re
from pathlib import Path

IGNORED_DIRS = {
    ".git", "node_modules", "venv", ".venv", "__pycache__", "dist", "build", ".next",
    "target", "vendor", "coverage", ".terraform",
}
DEVOPS_MARKERS = {
    "Dockerfile": "Dockerfile",
    "docker-compose.yml": "docker-compose.yml",
    "docker-compose.yaml": "docker-compose.yml",
    "Chart.yaml": "Helm chart",
    "values.yaml": "Helm chart",
}


def is_ignored_path(path: Path) -> bool:
    return any(part in IGNORED_DIRS for part in path.parts)


def safe_read_text(path: Path, limit: int = 300_000) -> str:
    if path.stat().st_size > limit:
        return ""
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return ""


def detect_project(root: Path) -> dict:
    files = [p for p in root.rglob("*") if p.is_file() and not is_ignored_path(p.relative_to(root))]
    rels = [p.relative_to(root).as_posix() for p in files]
    by_name = {p.name: p for p in files}
    stack: list[str] = []
    package_managers: list[str] = []
    frontend_path = None
    backend_path = None
    build_commands: dict[str, str] = {}
    start_commands: dict[str, str] = {}
    ports: dict[str, int] = {}
    databases: set[str] = set()
    cache: set[str] = set()

    package_files = [p for p in files if p.name == "package.json"]
    for package_file in package_files:
        rel_parent = package_file.parent.relative_to(root).as_posix()
        data = {}
        try:
            data = json.loads(safe_read_text(package_file) or "{}")
        except json.JSONDecodeError:
            data = {}
        deps = {**data.get("dependencies", {}), **data.get("devDependencies", {})}
        scripts = data.get("scripts", {})
        if "vite" in deps or (package_file.parent / "vite.config.js").exists():
            stack.extend(["React" if "react" in deps else "Frontend", "Vite"])
            frontend_path = rel_parent if rel_parent != "." else "."
            ports["frontend"] = 5173
            build_commands["frontend"] = "npm run build"
            start_commands["frontend"] = "nginx -g 'daemon off;'"
        if "next" in deps:
            stack.append("Next.js")
            frontend_path = rel_parent if rel_parent != "." else "."
            ports["frontend"] = 3000
        if "vue" in deps:
            stack.append("Vue")
        if "@angular/core" in deps:
            stack.append("Angular")
        if "express" in deps or "@nestjs/core" in deps:
            stack.append("Express" if "express" in deps else "NestJS")
            backend_path = rel_parent if rel_parent != "." else "."
            ports["backend"] = 3000
            start_commands["backend"] = scripts.get("start", "npm start")
        if "pg" in deps or "postgres" in deps or "prisma" in deps:
            databases.add("PostgreSQL")
        if "mysql" in deps or "mysql2" in deps:
            databases.add("MySQL")
        if "mongodb" in deps or "mongoose" in deps:
            databases.add("MongoDB")
        if "redis" in deps or "ioredis" in deps:
            cache.add("Redis")

    if "package-lock.json" in by_name:
        package_managers.append("npm")
    if "yarn.lock" in by_name:
        package_managers.append("yarn")
    if "pnpm-lock.yaml" in by_name:
        package_managers.append("pnpm")

    py_files = [p for p in files if p.name in {"requirements.txt", "pyproject.toml", "Pipfile", "main.py", "app.py", "manage.py"}]
    py_text = "\n".join(safe_read_text(p) for p in py_files[:12])
    if py_files:
        package_managers.append("pip" if "requirements.txt" in by_name else "poetry" if "poetry.lock" in by_name else "python")
    if re.search(r"fastapi|FastAPI", py_text):
        stack.append("FastAPI")
        backend_path = _common_parent(root, py_files) or backend_path
        ports["backend"] = 8000
        build_commands["backend"] = "pip install -r requirements.txt"
        start_commands["backend"] = "uvicorn app.main:app --host 0.0.0.0 --port 8000"
    if re.search(r"flask|Flask", py_text):
        stack.append("Flask")
        backend_path = _common_parent(root, py_files) or backend_path
        ports["backend"] = 5000
    if "manage.py" in by_name or re.search(r"django", py_text, re.I):
        stack.append("Django")
        backend_path = _common_parent(root, py_files) or backend_path
        ports["backend"] = 8000
    if re.search(r"psycopg|asyncpg|postgresql|DATABASE_URL|SQLAlchemy", py_text, re.I):
        databases.add("PostgreSQL")
    if re.search(r"redis|REDIS_URL", py_text, re.I):
        cache.add("Redis")

    if "go.mod" in by_name:
        stack.append("Go")
        package_managers.append("go modules")
    if "pom.xml" in by_name:
        stack.append("Java Maven")
        package_managers.append("maven")
    if "build.gradle" in by_name:
        stack.append("Java Gradle")
        package_managers.append("gradle")

    full_text = "\n".join(safe_read_text(p, 80_000) for p in files[:80])
    for match in re.findall(r"(?i)(PORT|port)\s*[:=]\s*['\"]?(\d{2,5})", full_text):
        value = int(match[1])
        if 1 < value < 65536:
            ports.setdefault("detected", value)
    if re.search(r"DATABASE_URL|postgresql://|postgres", full_text, re.I):
        databases.add("PostgreSQL")
    if re.search(r"REDIS_URL|redis", full_text, re.I):
        cache.add("Redis")

    existing = _existing_devops_files(rels)
    missing = _missing_devops_files(existing)
    detected_type = "fullstack" if frontend_path and backend_path else "frontend" if frontend_path else "backend" if backend_path else "unknown"
    return {
        "detected_project_type": detected_type,
        "detected_stack": list(dict.fromkeys(stack)) or ["Unknown"],
        "frontend_path": frontend_path,
        "backend_path": backend_path,
        "package_manager": " + ".join(dict.fromkeys(package_managers)) or None,
        "build_commands": build_commands,
        "start_commands": start_commands,
        "detected_ports": ports,
        "detected_databases": sorted(databases),
        "detected_cache": sorted(cache),
        "existing_devops_files": existing,
        "missing_devops_files": missing,
        "file_count": len(files),
        "total_size": sum(p.stat().st_size for p in files),
    }


def _common_parent(root: Path, files: list[Path]) -> str | None:
    for candidate in ("backend", "api", "server"):
        if any(candidate in p.parts for p in files):
            return candidate
    return None


def _existing_devops_files(rels: list[str]) -> list[str]:
    existing = set()
    for rel in rels:
        name = Path(rel).name
        if name in DEVOPS_MARKERS:
            existing.add(DEVOPS_MARKERS[name])
        if rel.startswith(".github/workflows/"):
            existing.add("GitHub Actions workflow")
        if rel.startswith("k8s/") and rel.endswith((".yaml", ".yml")):
            existing.add("Kubernetes manifests")
        if rel.startswith("helm/") or rel.startswith("charts/"):
            existing.add("Helm chart")
        if rel.startswith("argocd/"):
            existing.add("Argo CD application")
        if rel.startswith("terraform/") and rel.endswith(".tf"):
            existing.add("Terraform")
    return sorted(existing)


def _missing_devops_files(existing: list[str]) -> list[str]:
    desired = ["Dockerfile", "docker-compose.yml", "GitHub Actions workflow", "Kubernetes manifests", "Helm chart", "Argo CD application", "Terraform", ".env.example", "README deployment guide", "Security scan configuration"]
    return [item for item in desired if item not in existing]
