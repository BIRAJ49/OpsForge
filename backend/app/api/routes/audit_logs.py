from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import require_admin
from app.core.response import success_response
from app.models.audit_log import AuditLog
from app.schemas.audit_log import AuditLogOut

router = APIRouter(prefix="/audit-logs", tags=["audit-logs"])


@router.get("")
def list_all(db: Session = Depends(get_db), admin=Depends(require_admin)):
    logs = db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(500)).all()
    return success_response("Audit logs loaded", [AuditLogOut.model_validate(log).model_dump() for log in logs])
