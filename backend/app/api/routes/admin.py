from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import require_admin, request_meta
from app.core.response import success_response
from app.models.audit_log import AuditLog
from app.models.deployment import Deployment
from app.models.download import Download
from app.models.guest_usage import GuestUsage
from app.models.incident import Incident
from app.models.project import Project
from app.models.user import User
from app.schemas.audit_log import AuditLogOut
from app.schemas.deployment import DeploymentOut
from app.schemas.incident import IncidentOut
from app.schemas.project import ProjectOut
from app.schemas.user import UserOut, UserRoleUpdate
from app.services import monitoring_service
from app.services.audit_service import record_audit
from app.services.user_service import change_role, disable_user, list_users

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users")
def users(db: Session = Depends(get_db), admin=Depends(require_admin)):
    return success_response("Users loaded", [UserOut.model_validate(user).model_dump() for user in list_users(db)])


@router.patch("/users/{user_id}/role")
def update_role(user_id: int, payload: UserRoleUpdate, request: Request, db: Session = Depends(get_db), admin=Depends(require_admin)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    change_role(user, payload.role)
    ip, ua = request_meta(request)
    record_audit(db, user_id=admin.id, action="Admin role update", resource_type="user", resource_id=user.id, ip_address=ip, user_agent=ua)
    db.commit()
    return success_response("User role updated", UserOut.model_validate(user).model_dump())


@router.patch("/users/{user_id}/disable")
def disable(user_id: int, request: Request, db: Session = Depends(get_db), admin=Depends(require_admin)):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Admin cannot disable their own account")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    disable_user(user)
    ip, ua = request_meta(request)
    record_audit(db, user_id=admin.id, action="User disable", resource_type="user", resource_id=user.id, ip_address=ip, user_agent=ua)
    db.commit()
    return success_response("User disabled", UserOut.model_validate(user).model_dump())


@router.get("/projects")
def projects(db: Session = Depends(get_db), admin=Depends(require_admin)):
    rows = db.scalars(select(Project).order_by(Project.created_at.desc())).all()
    return success_response("All projects loaded", [ProjectOut.model_validate(row).model_dump() for row in rows])


@router.get("/deployments")
def deployments(db: Session = Depends(get_db), admin=Depends(require_admin)):
    rows = db.scalars(select(Deployment).order_by(Deployment.created_at.desc())).all()
    return success_response("All deployments loaded", [DeploymentOut.model_validate(row).model_dump() for row in rows])


@router.get("/incidents")
def incidents(db: Session = Depends(get_db), admin=Depends(require_admin)):
    rows = db.scalars(select(Incident).order_by(Incident.created_at.desc())).all()
    return success_response("All incidents loaded", [IncidentOut.model_validate(row).model_dump() for row in rows])


@router.get("/audit-logs")
def audit_logs(db: Session = Depends(get_db), admin=Depends(require_admin)):
    rows = db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(500)).all()
    return success_response("Audit logs loaded", [AuditLogOut.model_validate(row).model_dump() for row in rows])


@router.get("/system-health")
def system_health(admin=Depends(require_admin)):
    return success_response("System health loaded", {"api": "healthy", "database": "configured", "monitoring": monitoring_service.overview()})


@router.get("/settings")
def settings(admin=Depends(require_admin)):
    return success_response(
        "Admin settings loaded",
        {
            "github_default_branch": "main",
            "github_repo_format": "opsforge-{project-name}",
            "gitops_repo": "opsforge-gitops",
            "argocd_auto_sync": True,
            "argocd_prune": True,
            "argocd_self_heal": True,
            "secrets": "masked",
        },
    )


@router.get("/stats")
def stats(db: Session = Depends(get_db), admin=Depends(require_admin)):
    users = db.scalars(select(User).order_by(User.created_at.desc())).all()
    projects = db.scalars(select(Project).order_by(Project.created_at.desc())).all()
    total_downloads = db.scalar(select(func.count(Download.id))) or 0
    type_rows = db.execute(select(Project.deployment_type, func.count(Project.id)).group_by(Project.deployment_type)).all()
    return success_response(
        "Admin stats loaded",
        {
            "total_users": len(users),
            "active_users": len([user for user in users if user.is_active]),
            "total_projects": len(projects),
            "total_downloads": total_downloads,
            "recent_users": [UserOut.model_validate(user).model_dump() for user in users[:6]],
            "recent_projects": [ProjectOut.model_validate(project).model_dump() for project in projects[:8]],
            "most_used_project_types": [{"type": row[0].value, "count": row[1]} for row in type_rows],
            "activity": [
                {"label": f"Project {project.name} generated", "time": project.created_at.isoformat(), "project_id": project.id}
                for project in projects[:6]
            ],
        },
    )


@router.get("/system-usage")
def system_usage(db: Session = Depends(get_db), admin=Depends(require_admin)):
    total_projects = db.scalar(select(func.count(Project.id))) or 0
    total_downloads = db.scalar(select(func.count(Download.id))) or 0
    guest_generations = db.scalar(select(func.coalesce(func.sum(GuestUsage.generation_count), 0))) or 0
    rows = db.execute(
        select(Project.id, Project.name, Project.owner_id, func.count(Download.id).label("downloads"))
        .outerjoin(Download, Download.project_id == Project.id)
        .group_by(Project.id)
        .order_by(func.count(Download.id).desc())
        .limit(20)
    ).all()
    return success_response(
        "System usage loaded",
        {
            "guest_generations": guest_generations,
            "registered_generations": total_projects,
            "total_downloads": total_downloads,
            "suspicious_usage": [
                {"project_id": row.id, "project_name": row.name, "owner_id": row.owner_id, "downloads": row.downloads}
                for row in rows
            ],
        },
    )
