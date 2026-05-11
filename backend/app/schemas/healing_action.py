from datetime import datetime

from pydantic import BaseModel, Field


class HealingAnalyzeRequest(BaseModel):
    project_id: int | None = None
    deployment_id: int | None = None
    incident_id: int | None = None
    signal: str


class HealingActionRequest(BaseModel):
    project_id: int | None = None
    deployment_id: int | None = None
    incident_id: int | None = None
    action_type: str = Field(pattern="^(restart deployment|scale deployment|rollback deployment|collect logs|create incident|mark resolved)$")
    parameters: dict | None = None


class HealingActionOut(BaseModel):
    id: int
    project_id: int | None
    deployment_id: int | None
    incident_id: int | None
    action_type: str
    status: str
    requested_by: int | None
    approved_by: int | None
    parameters: dict | None
    result: dict | None
    created_at: datetime
    approved_at: datetime | None
    executed_at: datetime | None

    model_config = {"from_attributes": True}
