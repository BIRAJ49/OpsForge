from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import get_current_user, project_for_user, request_meta
from app.core.response import success_response
from app.models.generated_file import GeneratedFile
from app.services import github_service
from app.services.audit_service import record_audit
from app.services.generator_service import build_files
from app.services.ghcr_service import project_images
from app.services.integration_service import get_user_config_value, get_user_secret

router = APIRouter(tags=["github-ghcr"])


def _upgrade_legacy_workflow(project, files: list[GeneratedFile], github_username: str | None) -> None:
    current_workflow = next(
        (spec["content"] for spec in build_files(project, github_username) if spec["file_path"] == ".github/workflows/ci-cd.yml"),
        None,
    )
    if not current_workflow:
        return
    for file in files:
        if file.file_path != ".github/workflows/ci-cd.yml":
            continue
        legacy_manual_workflow = (
            "secrets.GHCR_USERNAME" in file.content
            or "secrets.GHCR_TOKEN" in file.content
            or "run backend tests here" in file.content
            or "docker build -t" in file.content and " ." in file.content
        )
        if legacy_manual_workflow:
            file.content = current_workflow


@router.post("/projects/{project_id}/github/create-repo")
async def create_repo(project_id: int, request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    project = project_for_user(project_id, db, current_user)
    github_username = get_user_config_value(db, "github", current_user, "login")
    result = await github_service.create_repo(db, project, get_user_secret(db, "github", current_user), github_username)
    ip, ua = request_meta(request)
    record_audit(db, user_id=current_user.id, action="GitHub repo creation", resource_type="project", resource_id=project.id, ip_address=ip, user_agent=ua, status=result["status"])
    db.commit()
    return success_response("GitHub repository creation requested", result)


@router.post("/projects/{project_id}/github/push-generated-files")
async def push_files(project_id: int, request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    project = project_for_user(project_id, db, current_user)
    files = db.scalars(select(GeneratedFile).where(GeneratedFile.project_id == project.id)).all()
    github_username = get_user_config_value(db, "github", current_user, "login")
    _upgrade_legacy_workflow(project, list(files), github_username)
    db.flush()
    result = await github_service.push_files(db, project, list(files), get_user_secret(db, "github", current_user), github_username)
    ip, ua = request_meta(request)
    record_audit(db, user_id=current_user.id, action="GitHub file push", resource_type="project", resource_id=project.id, ip_address=ip, user_agent=ua, status=result["status"])
    db.commit()
    return success_response("GitHub file push requested", result)


@router.post("/projects/{project_id}/github/create-gitops-repo")
async def create_gitops_repo(project_id: int, request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    project = project_for_user(project_id, db, current_user)
    github_username = get_user_config_value(db, "github", current_user, "login")
    result = await github_service.create_gitops_repo(get_user_secret(db, "github", current_user), github_username)
    if result.get("url"):
        project.gitops_repo_url = result["url"]
    ip, ua = request_meta(request)
    record_audit(db, user_id=current_user.id, action="GitOps repo creation", resource_type="project", resource_id=project.id, ip_address=ip, user_agent=ua, status=result["status"])
    db.commit()
    return success_response("GitOps repository creation requested", result)


@router.post("/projects/{project_id}/github/update-gitops-image")
async def update_gitops_image(project_id: int, image_tag: str = "latest", request: Request = None, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    project = project_for_user(project_id, db, current_user)
    result = await github_service.update_gitops_image(project, image_tag, get_user_secret(db, "github", current_user))
    db.commit()
    return success_response("GitOps image update requested", result)


@router.get("/projects/{project_id}/images")
def images(project_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    project = project_for_user(project_id, db, current_user)
    return success_response("Project images loaded", project_images(project))
