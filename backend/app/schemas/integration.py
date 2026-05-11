from datetime import datetime

from pydantic import BaseModel


class IntegrationConnect(BaseModel):
    token: str | None = None
    server: str | None = None
    username: str | None = None
    password: str | None = None
    kubeconfig_path: str | None = None


class IntegrationOut(BaseModel):
    id: int
    provider: str
    scope: str
    owner_id: int | None
    status: str
    config: dict | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
