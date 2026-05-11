from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import get_current_user, request_meta, require_admin
from app.core.response import success_response
from app.models.healing_action import HealingAction
from app.models.project import Project
from app.schemas.healing_action import HealingActionOut, HealingActionRequest, HealingAnalyzeRequest
from app.services.audit_service import record_audit
from app.services.healing_service import analyze, approve_action, execute_action, request_action

router = APIRouter(prefix="/healing", tags=["healing"])


@router.post("/analyze")
def analyze_signal(payload: HealingAnalyzeRequest, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return success_response("Healing analysis complete", analyze(payload.signal))


@router.post("/actions")
def create_action(payload: HealingActionRequest, request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
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
    project = db.get(Project, action.project_id) if action.project_id else None
    execute_action(action, current_user, project)
    ip, ua = request_meta(request)
    record_audit(db, user_id=current_user.id, action="Healing action execution", resource_type="healing_action", resource_id=action.id, ip_address=ip, user_agent=ua)
    db.commit()
    return success_response("Healing action executed", HealingActionOut.model_validate(action).model_dump())
