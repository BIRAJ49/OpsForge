from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import get_current_user, project_for_user, request_meta
from app.core.response import success_response
from app.services import argocd_service
from app.services.audit_service import record_audit

router = APIRouter(tags=["gitops"])


@router.get("/gitops/applications")
async def applications(current_user=Depends(get_current_user)):
    return success_response("Argo CD applications loaded", await argocd_service.list_applications())


@router.post("/projects/{project_id}/gitops/application")
def create_application(project_id: int, request: Request, path: str = "k8s", db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    project = project_for_user(project_id, db, current_user)
    result = argocd_service.create_or_update_application(project, path=path)
    ip, ua = request_meta(request)
    record_audit(db, user_id=current_user.id, action="Argo CD application registration", resource_type="project", resource_id=project.id, ip_address=ip, user_agent=ua, status=result["status"])
    db.commit()
    return success_response("Argo CD application registration requested", result)


@router.get("/projects/{project_id}/gitops/status")
async def status(project_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    project = project_for_user(project_id, db, current_user)
    return success_response("GitOps status loaded", await argocd_service.status(project))


@router.post("/projects/{project_id}/gitops/sync")
async def sync(project_id: int, request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    project = project_for_user(project_id, db, current_user)
    result = await argocd_service.sync(project)
    ip, ua = request_meta(request)
    record_audit(db, user_id=current_user.id, action="GitOps sync", resource_type="project", resource_id=project.id, ip_address=ip, user_agent=ua, status=result["status"])
    db.commit()
    return success_response("GitOps sync requested", result)


@router.post("/projects/{project_id}/gitops/refresh")
async def refresh(project_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    project = project_for_user(project_id, db, current_user)
    return success_response("GitOps refresh requested", await argocd_service.refresh(project))


@router.get("/projects/{project_id}/gitops/history")
def history(project_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    project = project_for_user(project_id, db, current_user)
    return success_response("GitOps history loaded", argocd_service.history(project))
