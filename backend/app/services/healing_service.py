from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.healing_action import HealingAction
from app.models.project import Project
from app.models.user import User, UserRole
from app.services.kubernetes_service import kubernetes_service
from app.services.rule_based_ai_service import analyze_text


def analyze(signal: str) -> dict:
    analysis = analyze_text(signal)
    recommendations = []
    if analysis["severity"] in {"high", "critical"}:
        recommendations.append("collect logs")
        recommendations.append("create incident")
    if "Rollback" in analysis["rollback_recommendation"]:
        recommendations.append("rollback deployment")
    return {"analysis": analysis, "recommended_actions": recommendations, "mode": "manual_approval"}


def request_action(db: Session, user: User, payload) -> HealingAction:
    action = HealingAction(
        project_id=payload.project_id,
        deployment_id=payload.deployment_id,
        incident_id=payload.incident_id,
        action_type=payload.action_type,
        parameters=payload.parameters or {},
        requested_by=user.id,
        status="requested",
    )
    db.add(action)
    db.flush()
    return action


def approve_action(action: HealingAction, admin: User) -> HealingAction:
    if admin.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin role required")
    action.status = "approved"
    action.approved_by = admin.id
    action.approved_at = datetime.now(UTC)
    return action


def execute_action(action: HealingAction, user: User, project: Project | None = None) -> HealingAction:
    risky = action.action_type in {"restart deployment", "rollback deployment"} and project and project.environment.value == "prod"
    if risky and action.status != "approved":
        raise HTTPException(status_code=403, detail="Production restart/rollback requires ADMIN approval")
    params = action.parameters or {}
    if action.action_type == "restart deployment" and params.get("pod_name"):
        result = kubernetes_service.restart_pod_owner(params["pod_name"], params.get("namespace"))
        if result.get("status") == "error":
            raise HTTPException(status_code=502, detail=result.get("message") or "Kubernetes restart failed")
        if result.get("status") in {"not_connected", "not_found", "unsupported"}:
            raise HTTPException(status_code=400, detail=result.get("message") or "Kubernetes restart could not be completed")
        action.status = "executed"
        action.executed_at = datetime.now(UTC)
        action.result = result
        return action
    action.status = "executed"
    action.executed_at = datetime.now(UTC)
    action.result = {"status": "pending", "message": "Action recorded; external execution requires configured Kubernetes/GitOps integration"}
    return action
