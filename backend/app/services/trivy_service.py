import json
import shutil
import subprocess
import re

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.project import Project
from app.models.security_scan import SecurityScan


def _summarize(result: dict) -> dict:
    counts = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
    for result_item in result.get("Results", []):
        for vuln in result_item.get("Vulnerabilities", []) or []:
            severity = vuln.get("Severity")
            if severity in counts:
                counts[severity] += 1
    return counts


def _normalize_image_ref(image: str) -> str:
    if not image:
        return image
    if "/" not in image:
        return image
    parts = image.split("/")
    return "/".join([parts[0].lower(), *[part.lower() for part in parts[1:]]])


def _safe_default_image(project: Project) -> str:
    project_name = re.sub(r"[^a-z0-9._-]+", "-", project.name.lower()).strip("-") or f"project-{project.id}"
    image = settings.GHCR_IMAGE_FORMAT.replace("{project-name}", project_name).replace("{tag}", "latest")
    return _normalize_image_ref(image)


def scan_project(db: Session, project: Project, scan_type: str = "image") -> SecurityScan:
    if not settings.TRIVY_ENABLED or not shutil.which(settings.TRIVY_PATH):
        raise HTTPException(status_code=400, detail="Trivy is not installed or TRIVY_ENABLED=false")
    target = _normalize_image_ref(project.registry_image) if project.registry_image else _safe_default_image(project)
    cmd = [settings.TRIVY_PATH, "image", "--format", "json", "--no-progress", "--timeout", "5m", target]
    try:
        completed = subprocess.run(cmd, check=False, capture_output=True, text=True, timeout=360)
    except subprocess.TimeoutExpired:
        completed = None
        result = {"ArtifactName": target, "error": "Trivy scan timed out"}
    else:
        try:
            result = json.loads(completed.stdout or "{}") if completed.stdout else {}
        except json.JSONDecodeError:
            result = {}
        if completed.stderr:
            result["stderr"] = completed.stderr.strip()
        result.setdefault("ArtifactName", target)
    counts = _summarize(result)
    scan = SecurityScan(
        project_id=project.id,
        scan_type=scan_type,
        status="completed" if completed and completed.returncode in (0, 1) else "failed",
        critical_count=counts["CRITICAL"],
        high_count=counts["HIGH"],
        medium_count=counts["MEDIUM"],
        low_count=counts["LOW"],
        result_json=result,
    )
    db.add(scan)
    db.flush()
    return scan
