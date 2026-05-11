from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import get_current_user, project_for_user, rate_limit, request_meta
from app.core.response import success_response
from app.schemas.incident import IncidentCreate, IncidentOut, IncidentUpdate
from app.services.audit_service import record_audit
from app.services.incident_service import analyze_incident, create_incident, get_incident, list_incidents, resolve_incident, update_incident

router = APIRouter(prefix="/incidents", tags=["incidents"])


@router.get("")
def list_all(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return success_response("Incidents loaded", [IncidentOut.model_validate(item).model_dump() for item in list_incidents(db, current_user)])


@router.post("")
def create(payload: IncidentCreate, request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    project_for_user(payload.project_id, db, current_user)
    incident = create_incident(db, payload)
    db.commit()
    return success_response("Incident created successfully", IncidentOut.model_validate(incident).model_dump(), 201)


@router.get("/{incident_id}")
def get(incident_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return success_response("Incident loaded", IncidentOut.model_validate(get_incident(db, incident_id, current_user)).model_dump())


@router.patch("/{incident_id}")
def patch(incident_id: int, payload: IncidentUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    incident = get_incident(db, incident_id, current_user)
    update_incident(incident, payload)
    db.commit()
    return success_response("Incident updated", IncidentOut.model_validate(incident).model_dump())


@router.post("/{incident_id}/resolve")
def resolve(incident_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    incident = resolve_incident(get_incident(db, incident_id, current_user), current_user)
    db.commit()
    return success_response("Incident resolved", IncidentOut.model_validate(incident).model_dump())


@router.post("/{incident_id}/rollback")
def rollback(incident_id: int, request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    incident = get_incident(db, incident_id, current_user)
    ip, ua = request_meta(request)
    record_audit(db, user_id=current_user.id, action="Rollback deployment", resource_type="incident", resource_id=incident.id, ip_address=ip, user_agent=ua)
    db.commit()
    return success_response("Rollback requested for incident", {"status": "pending", "requires_admin_approval": True})


@router.post("/{incident_id}/restart")
def restart(incident_id: int, request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    incident = get_incident(db, incident_id, current_user)
    ip, ua = request_meta(request)
    record_audit(db, user_id=current_user.id, action="Restart deployment", resource_type="incident", resource_id=incident.id, ip_address=ip, user_agent=ua)
    db.commit()
    return success_response("Restart requested for incident", {"status": "pending", "requires_admin_approval": True})


@router.post("/{incident_id}/analyze", dependencies=[Depends(rate_limit("incident-analysis", 10, 900))])
def analyze(incident_id: int, request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    incident = get_incident(db, incident_id, current_user)
    result = analyze_incident(incident)
    ip, ua = request_meta(request)
    record_audit(db, user_id=current_user.id, action="Incident analysis", resource_type="incident", resource_id=incident.id, ip_address=ip, user_agent=ua)
    db.commit()
    return success_response("Incident analyzed", result)


@router.get("/{incident_id}/ai-analysis")
def ai_analysis(incident_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    incident = get_incident(db, incident_id, current_user)
    return success_response("AI analysis loaded", incident.ai_analysis or {})
