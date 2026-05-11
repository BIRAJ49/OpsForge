from datetime import datetime

from pydantic import BaseModel


class GeneratedFileOut(BaseModel):
    id: int
    project_id: int
    file_name: str
    file_path: str
    file_type: str
    content: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
