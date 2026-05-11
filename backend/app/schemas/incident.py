from datetime import datetime

from pydantic import BaseModel, Field


class IncidentCreate(BaseModel):
    project_id: int
    title: str = Field(min_length=3, max_length=255)
    severity: str = Field(pattern="^(low|medium|high|critical)$")
    affected_service: str
    root_cause_summary: str | None = None
    source: str = Field(default="manual", pattern="^(kubernetes|manual|security|mock)$")
    evidence: str | None = None


class IncidentUpdate(BaseModel):
    title: str | None = None
    severity: str | None = Field(default=None, pattern="^(low|medium|high|critical)$")
    affected_service: str | None = None
    status: str | None = Field(default=None, pattern="^(open|investigating|resolved)$")
    root_cause_summary: str | None = None
    evidence: str | None = None


class IncidentOut(BaseModel):
    id: int
    project_id: int
    title: str
    severity: str
    affected_service: str
    status: str
    root_cause_summary: str | None
    source: str
    ai_analysis: dict | None = None
    created_at: datetime
    resolved_at: datetime | None
    resolved_by: int | None

    model_config = {"from_attributes": True}
