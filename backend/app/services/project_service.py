from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.project import Project
from app.models.user import User, UserRole
from app.schemas.project import ProjectCreate, ProjectUpdate
from app.utils.file_builder import normalize_project_name
from app.services.namespace_service import user_app_namespace


def create_project(db: Session, payload: ProjectCreate, user: User) -> Project:
    slug = normalize_project_name(payload.name)
    namespace = user_app_namespace(payload.environment.value)
    data = payload.model_dump()
    data.pop("name", None)
    project = Project(
        **data,
        name=slug,
        owner_id=user.id,
        namespace=namespace,
        registry_image=settings.GHCR_IMAGE_FORMAT.replace("{project-name}", slug).replace("{tag}", "latest"),
    )
    db.add(project)
    db.flush()
    return project


def list_projects(db: Session, user: User) -> list[Project]:
    stmt = select(Project).order_by(Project.created_at.desc())
    if user.role != UserRole.ADMIN:
        stmt = stmt.where(Project.owner_id == user.id)
    return list(db.scalars(stmt))


def update_project(db: Session, project: Project, payload: ProjectUpdate) -> Project:
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, key, value)
    if payload.name:
        project.name = normalize_project_name(payload.name)
    return project
