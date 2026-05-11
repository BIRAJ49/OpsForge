from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import get_current_user, project_for_user
from app.core.response import success_response
from app.models.security_scan import SecurityScan
from app.models.project import Project
from app.models.user import UserRole
from app.schemas.security_scan import SecurityScanOut
from app.services.trivy_service import scan_project

router = APIRouter(prefix="/security", tags=["security"])


@router.post("/scan/project/{project_id}")
def scan(project_id: int, scan_type: str = "image", db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    project = project_for_user(project_id, db, current_user)
    result = scan_project(db, project, scan_type)
    db.commit()
    return success_response("Security scan completed", SecurityScanOut.model_validate(result).model_dump(), 201)


@router.get("/scans")
def scans(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    stmt = select(SecurityScan).join(Project, SecurityScan.project_id == Project.id).order_by(SecurityScan.created_at.desc())
    if current_user.role != UserRole.ADMIN:
        stmt = stmt.where(Project.owner_id == current_user.id)
    rows = db.scalars(stmt).all()
    return success_response("Security scans loaded", [SecurityScanOut.model_validate(row).model_dump() for row in rows])


@router.get("/scans/{scan_id}")
def scan_detail(scan_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    scan = db.get(SecurityScan, scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Security scan not found")
    project_for_user(scan.project_id, db, current_user)
    return success_response("Security scan loaded", SecurityScanOut.model_validate(scan).model_dump())
