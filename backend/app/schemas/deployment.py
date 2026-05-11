from datetime import datetime

from pydantic import BaseModel, Field


class DeployRequest(BaseModel):
    image_tag: str = "latest"
    replicas: int = Field(default=1, ge=1, le=50)


class ScaleRequest(BaseModel):
    replicas: int = Field(ge=1, le=50)


class DeploymentOut(BaseModel):
    id: int
    project_id: int
    environment: str
    namespace: str
    image_name: str
    image_tag: str
    status: str
    replicas: int
    deployed_by: int | None
    deployed_at: datetime | None
    previous_image_tag: str | None
    rollback_available: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
