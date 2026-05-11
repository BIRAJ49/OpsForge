from datetime import datetime

from pydantic import BaseModel


class SecurityScanOut(BaseModel):
    id: int
    project_id: int
    scan_type: str
    status: str
    critical_count: int
    high_count: int
    medium_count: int
    low_count: int
    result_json: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}
