from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import get_current_user, project_for_user, request_meta
from app.core.response import success_response
from app.schemas.project import ProjectCreate, ProjectOut, ProjectUpdate
from app.services.audit_service import record_audit
from app.services.project_service import create_project, list_projects, update_project

router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("")
def create(payload: ProjectCreate, request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    project = create_project(db, payload, current_user)
    ip, ua = request_meta(request)
    record_audit(db, user_id=current_user.id, action="Project creation", resource_type="project", resource_id=project.id, ip_address=ip, user_agent=ua)
    db.commit()
    return success_response("Project created successfully", ProjectOut.model_validate(project).model_dump(), 201)


@router.get("")
def list_all(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    projects = [ProjectOut.model_validate(project).model_dump() for project in list_projects(db, current_user)]
    return success_response("Projects loaded", projects)


@router.get("/{project_id}")
def get(project_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    project = project_for_user(project_id, db, current_user)
    return success_response("Project loaded", ProjectOut.model_validate(project).model_dump())


@router.patch("/{project_id}")
def patch(project_id: int, payload: ProjectUpdate, request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    project = project_for_user(project_id, db, current_user)
    update_project(db, project, payload)
    ip, ua = request_meta(request)
    record_audit(db, user_id=current_user.id, action="Project update", resource_type="project", resource_id=project.id, ip_address=ip, user_agent=ua)
    db.commit()
    return success_response("Project updated successfully", ProjectOut.model_validate(project).model_dump())


@router.delete("/{project_id}")
def delete(project_id: int, request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    project = project_for_user(project_id, db, current_user)
    db.delete(project)
    ip, ua = request_meta(request)
    record_audit(db, user_id=current_user.id, action="Project deletion", resource_type="project", resource_id=project_id, ip_address=ip, user_agent=ua)
    db.commit()
    return success_response("Project deleted successfully")
