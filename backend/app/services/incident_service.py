from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.incident import Incident
from app.models.project import Project
from app.models.user import User, UserRole
from app.schemas.incident import IncidentCreate, IncidentUpdate
from app.services.rule_based_ai_service import analyze_text


def list_incidents(db: Session, user: User) -> list[Incident]:
    stmt = select(Incident).join(Project, Incident.project_id == Project.id).order_by(Incident.created_at.desc())
    if user.role != UserRole.ADMIN:
        stmt = stmt.where(Project.owner_id == user.id)
    return list(db.scalars(stmt))


def get_incident(db: Session, incident_id: int, user: User) -> Incident:
    incident = db.get(Incident, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    project = db.get(Project, incident.project_id)
    if user.role != UserRole.ADMIN and project.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Permission denied")
    return incident


def create_incident(db: Session, payload: IncidentCreate) -> Incident:
    incident = Incident(**payload.model_dump())
    db.add(incident)
    db.flush()
    return incident


def update_incident(incident: Incident, payload: IncidentUpdate) -> Incident:
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(incident, key, value)
    return incident


def resolve_incident(incident: Incident, user: User) -> Incident:
    incident.status = "resolved"
    incident.resolved_at = datetime.now(UTC)
    incident.resolved_by = user.id
    return incident


def analyze_incident(incident: Incident) -> dict:
    evidence = "\n".join([incident.title, incident.root_cause_summary or "", incident.evidence or ""])
    analysis = analyze_text(evidence)
    incident.ai_analysis = analysis
    incident.root_cause_summary = analysis["root_cause"]
    return analysis
