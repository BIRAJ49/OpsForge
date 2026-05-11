from fastapi import APIRouter, Depends

from app.core.permissions import get_current_user
from app.core.response import success_response
from app.services import logs_service

router = APIRouter(prefix="/logs", tags=["logs"])


@router.get("")
def logs(project_id: int | None = None, service: str | None = None, severity: str | None = None, start_time: str | None = None, end_time: str | None = None, search: str | None = None, current_user=Depends(get_current_user)):
    return success_response("Logs loaded", logs_service.logs(service=service, severity=severity, search=search))


@router.get("/services")
def services(current_user=Depends(get_current_user)):
    return success_response("Log services loaded", logs_service.services())


@router.get("/search")
def search(q: str, service: str | None = None, severity: str | None = None, current_user=Depends(get_current_user)):
    return success_response("Log search complete", logs_service.logs(service=service, severity=severity, search=q))
