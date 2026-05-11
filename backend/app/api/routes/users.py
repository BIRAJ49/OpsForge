from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import get_current_user
from app.core.response import success_response
from app.models.download import Download
from app.models.project import Project
from app.schemas.user import UserOut

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me")
def me(current_user=Depends(get_current_user)):
    return success_response("User profile loaded", UserOut.model_validate(current_user).model_dump())


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    projects = db.scalars(select(Project).where(Project.owner_id == current_user.id).order_by(Project.created_at.desc())).all()
    downloads = db.scalar(select(func.count(Download.id)).where(Download.user_id == current_user.id)) or 0
    recent_projects = [
        {
            "id": project.id,
            "name": project.name,
            "title": project.name.replace("-", " ").title(),
            "project_type": project.deployment_type.value,
            "difficulty": "Intermediate",
            "created_at": project.created_at,
            "downloads": db.scalar(select(func.count(Download.id)).where(Download.project_id == project.id)) or 0,
        }
        for project in projects[:8]
    ]
    return success_response(
        "User dashboard loaded",
        {
            "total_projects": len(projects),
            "saved_projects": len(projects),
            "downloads": downloads,
            "account_type": current_user.role.value,
            "recent_projects": recent_projects,
        },
    )
