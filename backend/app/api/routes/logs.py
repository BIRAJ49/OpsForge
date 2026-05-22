from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import get_current_user, namespaces_for_user, project_for_user
from app.core.response import success_response
from app.services import logs_service

router = APIRouter(prefix="/logs", tags=["logs"])


def _visible_namespace(project_id: int | None, namespace: str | None, db: Session, current_user) -> str | None:
    if project_id:
        return project_for_user(project_id, db, current_user).namespace
    allowed = namespaces_for_user(db, current_user)
    if allowed is None:
        return namespace
    if namespace:
        if namespace not in allowed:
            raise HTTPException(status_code=403, detail="Namespace is not available for this user")
        return namespace
    return sorted(allowed)[0] if allowed else "__no_project_namespace__"


@router.get("")
def logs(
    project_id: int | None = None,
    service: str | None = None,
    severity: str | None = None,
    start_time: str | None = None,
    end_time: str | None = None,
    search: str | None = None,
    namespace: str | None = None,
    limit: int = 500,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    visible_namespace = _visible_namespace(project_id, namespace, db, current_user)
    return success_response(
        "Logs loaded",
        logs_service.logs(service=service, severity=severity, search=search, namespace=visible_namespace, limit=limit),
    )


@router.get("/services")
def services(namespace: str | None = None, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    visible_namespace = _visible_namespace(None, namespace, db, current_user)
    return success_response("Log services loaded", logs_service.services(namespace=visible_namespace))


@router.get("/search")
def search(
    q: str,
    service: str | None = None,
    severity: str | None = None,
    namespace: str | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    visible_namespace = _visible_namespace(None, namespace, db, current_user)
    return success_response("Log search complete", logs_service.logs(service=service, severity=severity, search=q, namespace=visible_namespace))
