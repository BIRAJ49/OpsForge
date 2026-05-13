from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.deployment import Deployment
from app.models.generated_file import GeneratedFile
from app.models.project import Project
from app.models.user import User
from app.services.namespace_service import user_app_namespace


def deploy(db: Session, project: Project, user: User, image_tag: str, replicas: int) -> Deployment:
    generated_count = db.scalar(select(GeneratedFile).where(GeneratedFile.project_id == project.id).limit(1))
    if not generated_count:
        raise HTTPException(status_code=400, detail="Generate files before deployment")
    previous = db.scalar(select(Deployment).where(Deployment.project_id == project.id).order_by(Deployment.created_at.desc()))
    deployment = Deployment(
        project_id=project.id,
        environment=project.environment.value,
        namespace=user_app_namespace(project.environment.value, project.namespace),
        image_name=settings.GHCR_IMAGE_FORMAT.replace("{project-name}", project.name).replace(":{tag}", ""),
        image_tag=image_tag,
        status="pending",
        replicas=replicas,
        deployed_by=user.id,
        deployed_at=datetime.now(UTC),
        previous_image_tag=previous.image_tag if previous else None,
        rollback_available=bool(previous),
    )
    db.add(deployment)
    db.flush()
    return deployment


def action_response(deployment: Deployment, action: str, extra: dict | None = None) -> dict:
    return {"status": "pending", "action": action, "deployment_id": deployment.id, "message": "Action recorded; Kubernetes execution requires configured cluster access", **(extra or {})}
