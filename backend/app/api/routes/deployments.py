from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import get_current_user, project_for_user, request_meta
from app.core.response import success_response
from app.models.deployment import Deployment
from app.models.user import UserRole
from app.schemas.deployment import DeployRequest, DeploymentOut, ScaleRequest
from app.services.audit_service import record_audit
from app.services.deployment_service import action_response, deploy

router = APIRouter(tags=["deployments"])


@router.post("/projects/{project_id}/deploy")
def deploy_project(project_id: int, payload: DeployRequest, request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    project = project_for_user(project_id, db, current_user)
    deployment = deploy(db, project, current_user, payload.image_tag, payload.replicas)
    ip, ua = request_meta(request)
    record_audit(db, user_id=current_user.id, action="Deployment trigger", resource_type="deployment", resource_id=deployment.id, ip_address=ip, user_agent=ua)
    db.commit()
    return success_response("Deployment workflow recorded", DeploymentOut.model_validate(deployment).model_dump(), 201)


@router.get("/projects/{project_id}/deployments")
def project_deployments(project_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    project_for_user(project_id, db, current_user)
    deployments = db.scalars(select(Deployment).where(Deployment.project_id == project_id).order_by(Deployment.created_at.desc())).all()
    return success_response("Deployments loaded", [DeploymentOut.model_validate(item).model_dump() for item in deployments])


@router.get("/deployments/{deployment_id}")
def get_deployment(deployment_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    deployment = db.get(Deployment, deployment_id)
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")
    project_for_user(deployment.project_id, db, current_user)
    return success_response("Deployment loaded", DeploymentOut.model_validate(deployment).model_dump())


@router.post("/deployments/{deployment_id}/restart")
def restart(deployment_id: int, request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    deployment = db.get(Deployment, deployment_id)
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")
    project_for_user(deployment.project_id, db, current_user)
    ip, ua = request_meta(request)
    record_audit(db, user_id=current_user.id, action="Restart deployment", resource_type="deployment", resource_id=deployment.id, ip_address=ip, user_agent=ua)
    db.commit()
    return success_response("Restart requested", action_response(deployment, "restart"))


@router.post("/deployments/{deployment_id}/rollback")
def rollback(deployment_id: int, request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    deployment = db.get(Deployment, deployment_id)
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")
    project_for_user(deployment.project_id, db, current_user)
    ip, ua = request_meta(request)
    record_audit(db, user_id=current_user.id, action="Rollback deployment", resource_type="deployment", resource_id=deployment.id, ip_address=ip, user_agent=ua)
    db.commit()
    return success_response("Rollback requested", action_response(deployment, "rollback"))


@router.post("/deployments/{deployment_id}/scale")
def scale(deployment_id: int, payload: ScaleRequest, request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    deployment = db.get(Deployment, deployment_id)
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")
    project_for_user(deployment.project_id, db, current_user)
    deployment.replicas = payload.replicas
    ip, ua = request_meta(request)
    record_audit(db, user_id=current_user.id, action="Scale deployment", resource_type="deployment", resource_id=deployment.id, ip_address=ip, user_agent=ua)
    db.commit()
    return success_response("Scale requested", action_response(deployment, "scale", {"replicas": payload.replicas}))
