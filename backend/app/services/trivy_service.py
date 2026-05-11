import json
import shutil
import subprocess

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


def scan_project(db: Session, project: Project, scan_type: str = "image") -> SecurityScan:
    if not settings.TRIVY_ENABLED or not shutil.which(settings.TRIVY_PATH):
        raise HTTPException(status_code=400, detail="Trivy is not installed or TRIVY_ENABLED=false")
    target = project.registry_image or settings.GHCR_IMAGE_FORMAT.replace("{project-name}", project.name).replace("{tag}", "latest")
    cmd = [settings.TRIVY_PATH, "image", "--format", "json", target]
    completed = subprocess.run(cmd, check=False, capture_output=True, text=True, timeout=120)
    result = json.loads(completed.stdout or "{}") if completed.stdout else {"error": completed.stderr}
    counts = _summarize(result)
    scan = SecurityScan(
        project_id=project.id,
        scan_type=scan_type,
        status="completed" if completed.returncode in (0, 1) else "failed",
        critical_count=counts["CRITICAL"],
        high_count=counts["HIGH"],
        medium_count=counts["MEDIUM"],
        low_count=counts["LOW"],
        result_json=result,
    )
    db.add(scan)
    db.flush()
    return scan
