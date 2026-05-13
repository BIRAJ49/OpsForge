from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import get_current_user, project_for_user, request_meta, require_admin
from app.core.response import success_response
from app.models.healing_action import HealingAction
from app.models.project import Project
from app.models.user import UserRole
from app.schemas.healing_action import HealingActionOut, HealingActionRequest, HealingAnalyzeRequest
from app.services.audit_service import record_audit
from app.services.healing_service import analyze, approve_action, execute_action, request_action

router = APIRouter(prefix="/healing", tags=["healing"])


@router.post("/analyze")
def analyze_signal(payload: HealingAnalyzeRequest, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return success_response("Healing analysis complete", analyze(payload.signal))


@router.get("/actions")
def list_actions(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    query = db.query(HealingAction).order_by(HealingAction.created_at.desc())
    if current_user.role != UserRole.ADMIN:
        user_project_ids = [project.id for project in db.query(Project.id).filter(Project.owner_id == current_user.id).all()]
        filters = [HealingAction.requested_by == current_user.id]
        if user_project_ids:
            filters.append(HealingAction.project_id.in_(user_project_ids))
        query = query.filter(or_(*filters))
    actions = query.all()
    return success_response("Healing actions loaded", [HealingActionOut.model_validate(action).model_dump() for action in actions])


@router.post("/actions")
def create_action(payload: HealingActionRequest, request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if payload.project_id:
        project_for_user(payload.project_id, db, current_user)
    action = request_action(db, current_user, payload)
    ip, ua = request_meta(request)
    record_audit(db, user_id=current_user.id, action=payload.action_type.title(), resource_type="healing_action", resource_id=action.id, ip_address=ip, user_agent=ua)
    db.commit()
    return success_response("Healing action requested", HealingActionOut.model_validate(action).model_dump(), 201)


@router.post("/actions/{action_id}/approve")
def approve(action_id: int, request: Request, db: Session = Depends(get_db), admin=Depends(require_admin)):
    action = db.get(HealingAction, action_id)
    if not action:
        raise HTTPException(status_code=404, detail="Healing action not found")
    approve_action(action, admin)
    ip, ua = request_meta(request)
    record_audit(db, user_id=admin.id, action="Healing action approval", resource_type="healing_action", resource_id=action.id, ip_address=ip, user_agent=ua)
    db.commit()
    return success_response("Healing action approved", HealingActionOut.model_validate(action).model_dump())


@router.post("/actions/{action_id}/execute")
def execute(action_id: int, request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    action = db.get(HealingAction, action_id)
    if not action:
        raise HTTPException(status_code=404, detail="Healing action not found")
    if current_user.role != UserRole.ADMIN:
        if action.project_id:
            project_for_user(action.project_id, db, current_user)
        elif action.requested_by != current_user.id:
            raise HTTPException(status_code=403, detail="Permission denied")
    project = db.get(Project, action.project_id) if action.project_id else None
    execute_action(action, current_user, project)
    ip, ua = request_meta(request)
    record_audit(db, user_id=current_user.id, action="Healing action execution", resource_type="healing_action", resource_id=action.id, ip_address=ip, user_agent=ua)
    db.commit()
    return success_response("Healing action executed", HealingActionOut.model_validate(action).model_dump())
