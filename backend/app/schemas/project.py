from datetime import datetime

from pydantic import BaseModel, Field

from app.models.project import AppType, DeploymentType, Environment


class ProjectCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str | None = None
    app_type: AppType
    stack: str = "React + FastAPI + PostgreSQL + Redis"
    deployment_type: DeploymentType
    environment: Environment
    monitoring_enabled: bool = True
    security_scan_enabled: bool = True
    ai_assistant_enabled: bool = True
    auto_healing_enabled: bool = False


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = None
    app_type: AppType | None = None
    stack: str | None = None
    deployment_type: DeploymentType | None = None
    environment: Environment | None = None
    monitoring_enabled: bool | None = None
    security_scan_enabled: bool | None = None
    ai_assistant_enabled: bool | None = None
    auto_healing_enabled: bool | None = None


class ProjectOut(BaseModel):
    id: int
    name: str
    description: str | None
    app_type: AppType
    stack: str
    deployment_type: DeploymentType
    environment: Environment
    monitoring_enabled: bool
    security_scan_enabled: bool
    ai_assistant_enabled: bool
    auto_healing_enabled: bool
    github_repo_url: str | None
    gitops_repo_url: str | None
    registry_image: str | None
    namespace: str
    owner_id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
