from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import get_current_user, project_for_user, request_meta
from app.core.response import error_response, success_response
from app.models.project import AppType, DeploymentType, Environment, Project
from app.models.project_analysis import AnalysisFileSummary, UploadedProject, UploadStatus, UploadType
from app.schemas.generated_file import GeneratedFileOut
from app.schemas.project_analysis import (
    AnalysisFileSummaryOut,
    AnalyzeGithubRequest,
    GenerateFromAnalysisRequest,
    GithubImportRequest,
    ProjectAnalysisOut,
    ProjectProfileUpdateRequest,
    RegenerateFileRequest,
    UploadedProjectOut,
)
from app.services.audit_service import record_audit
from app.services.generate_from_analysis_service import generate_from_analysis, regenerate_one_file
from app.services.github_repo_analyzer_service import clone_github_repo
from app.services.integration_service import get_user_config_value, get_user_secret
from app.services.project_analyzer_service import analyze_project_path, latest_analysis
from app.services.project_service import create_project
from app.services.upload_service import cleanup_upload_path, extract_zip_upload
from app.schemas.project import ProjectCreate

router = APIRouter(prefix="/projects", tags=["project-analysis"])


@router.post("/upload")
def upload_project(
    request: Request,
    project_name: str = Form(...),
    description: str | None = Form(None),
    upload_type: str = Form("zip"),
    branch_name: str = Form("main"),
    environment: Environment = Form(Environment.dev),
    deployment_type: DeploymentType = Form(DeploymentType.gitops),
    monitoring_enabled: bool = Form(True),
    security_scan_enabled: bool = Form(True),
    gitops_enabled: bool = Form(True),
    auto_healing_enabled: bool = Form(False),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if upload_type != "zip":
        return error_response("Invalid upload type", "INVALID_UPLOAD", 400)
    project = create_project(
        db,
        ProjectCreate(
            name=project_name,
            description=description,
            app_type=AppType.fullstack,
            deployment_type=deployment_type,
            environment=environment,
            monitoring_enabled=monitoring_enabled,
            security_scan_enabled=security_scan_enabled,
            auto_healing_enabled=auto_healing_enabled,
        ),
        current_user,
    )
    upload = UploadedProject(project_id=project.id, owner_id=current_user.id, upload_type=UploadType.zip, original_filename=file.filename, branch_name=branch_name, status=UploadStatus.uploaded)
    db.add(upload)
    db.flush()
    root: Path | None = None
    try:
        root, meta = extract_zip_upload(file)
        upload.status = UploadStatus.extracted
        upload.file_count = meta["file_count"]
        upload.total_size = meta["total_size"]
        analysis = analyze_project_path(db, project.id, current_user.id, root)
        upload.status = UploadStatus.analyzed
        ip, ua = request_meta(request)
        record_audit(db, user_id=current_user.id, action="Project uploaded", resource_type="project", resource_id=project.id, ip_address=ip, user_agent=ua)
        record_audit(db, user_id=current_user.id, action="Project analysis completed", resource_type="project", resource_id=project.id, ip_address=ip, user_agent=ua)
        db.commit()
        return success_response("Project analyzed successfully", {"project": {"id": project.id, "name": project.name}, "upload": UploadedProjectOut.model_validate(upload).model_dump(), "analysis": ProjectAnalysisOut.model_validate(analysis).model_dump()}, 201)
    except HTTPException as exc:
        upload.status = UploadStatus.failed
        upload.error_message = str(exc.detail)
        db.commit()
        return error_response(str(exc.detail), "INVALID_UPLOAD" if exc.status_code < 500 else "ANALYSIS_FAILED", exc.status_code)
    except Exception as exc:
        upload.status = UploadStatus.failed
        upload.error_message = "Analysis failed"
        db.commit()
        return error_response("Analysis failed", "ANALYSIS_FAILED", 500)
    finally:
        if root:
            cleanup_upload_path(root)


@router.get("/{project_id}/upload-status")
def upload_status(project_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    project_for_user(project_id, db, current_user)
    upload = db.scalar(select(UploadedProject).where(UploadedProject.project_id == project_id).order_by(UploadedProject.created_at.desc()))
    if not upload:
        raise HTTPException(status_code=404, detail="Upload not found")
    return success_response("Upload status loaded", UploadedProjectOut.model_validate(upload).model_dump())


@router.post("/import-from-github")
def import_from_github(payload: GithubImportRequest, request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    project = create_project(
        db,
        ProjectCreate(name=payload.project_name, description=payload.description, app_type=AppType.fullstack, deployment_type=payload.deployment_type, environment=payload.environment, monitoring_enabled=payload.monitoring_enabled, security_scan_enabled=payload.security_scan_enabled, auto_healing_enabled=payload.auto_healing_enabled),
        current_user,
    )
    project.github_repo_url = payload.github_repo_url
    upload = UploadedProject(project_id=project.id, owner_id=current_user.id, upload_type=UploadType.github, github_repo_url=payload.github_repo_url, branch_name=payload.branch_name, status=UploadStatus.uploaded)
    db.add(upload)
    db.flush()
    root = None
    try:
        root = clone_github_repo(payload.github_repo_url, payload.branch_name, get_user_secret(db, "github", current_user))
        upload.status = UploadStatus.extracted
        analysis = analyze_project_path(db, project.id, current_user.id, root)
        upload.status = UploadStatus.analyzed
        upload.file_count = analysis.analysis_json.get("file_count", 0)
        upload.total_size = analysis.analysis_json.get("total_size", 0)
        ip, ua = request_meta(request)
        record_audit(db, user_id=current_user.id, action="GitHub repo imported", resource_type="project", resource_id=project.id, ip_address=ip, user_agent=ua)
        db.commit()
        return success_response("GitHub repo analyzed successfully", {"project": {"id": project.id, "name": project.name}, "analysis": ProjectAnalysisOut.model_validate(analysis).model_dump()}, 201)
    except HTTPException as exc:
        upload.status = UploadStatus.failed
        upload.error_message = str(exc.detail)
        db.commit()
        return error_response(str(exc.detail), "GITHUB_IMPORT_FAILED", exc.status_code)
    except Exception:
        upload.status = UploadStatus.failed
        upload.error_message = "GitHub import failed"
        db.commit()
        return error_response("GitHub import failed", "GITHUB_IMPORT_FAILED", 500)
    finally:
        if root:
            cleanup_upload_path(root)


@router.post("/{project_id}/analyze-github-repo")
def analyze_github_repo(project_id: int, payload: AnalyzeGithubRequest, request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    project = project_for_user(project_id, db, current_user)
    repo_url = payload.github_repo_url or project.github_repo_url
    if not repo_url:
        return error_response("GitHub repo URL is required", "GITHUB_REPO_REQUIRED", 400)
    root = clone_github_repo(repo_url, payload.branch_name, get_user_secret(db, "github", current_user))
    try:
        analysis = analyze_project_path(db, project.id, current_user.id, root)
        ip, ua = request_meta(request)
        record_audit(db, user_id=current_user.id, action="Project analysis completed", resource_type="project", resource_id=project.id, ip_address=ip, user_agent=ua)
        db.commit()
        return success_response("Project analyzed successfully", ProjectAnalysisOut.model_validate(analysis).model_dump())
    finally:
        cleanup_upload_path(root)


@router.post("/{project_id}/analyze")
def analyze_existing_project(project_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    project_for_user(project_id, db, current_user)
    analysis = latest_analysis(db, project_id)
    if not analysis:
        return error_response("No uploaded source is available for analysis", "NO_UPLOAD_SOURCE", 400)
    return success_response("Project analysis loaded", ProjectAnalysisOut.model_validate(analysis).model_dump())


@router.get("/{project_id}/analysis")
def get_analysis(project_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    project_for_user(project_id, db, current_user)
    analysis = latest_analysis(db, project_id)
    if not analysis:
        raise HTTPException(status_code=404, detail="Project analysis not found")
    return success_response("Project analysis loaded", ProjectAnalysisOut.model_validate(analysis).model_dump())


@router.put("/{project_id}/analysis/profile")
def update_analysis_profile(project_id: int, payload: ProjectProfileUpdateRequest, request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    project = project_for_user(project_id, db, current_user)
    analysis = latest_analysis(db, project_id)
    if not analysis:
        return error_response("Project analysis not found", "ANALYSIS_NOT_FOUND", 404)
    analysis.analysis_json = {**(analysis.analysis_json or {}), "project_profile": payload.project_profile}
    ip, ua = request_meta(request)
    record_audit(db, user_id=current_user.id, action="Project profile update", resource_type="project", resource_id=project.id, ip_address=ip, user_agent=ua)
    db.commit()
    db.refresh(analysis)
    return success_response("Project profile updated", ProjectAnalysisOut.model_validate(analysis).model_dump())


@router.get("/{project_id}/analysis/files")
def get_analysis_files(project_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    project_for_user(project_id, db, current_user)
    analysis = latest_analysis(db, project_id)
    if not analysis:
        raise HTTPException(status_code=404, detail="Project analysis not found")
    files = db.scalars(select(AnalysisFileSummary).where(AnalysisFileSummary.analysis_id == analysis.id).order_by(AnalysisFileSummary.file_path)).all()
    return success_response("Analysis file summaries loaded", [AnalysisFileSummaryOut.model_validate(item).model_dump() for item in files])


@router.post("/{project_id}/generate-from-analysis")
def generate_files_from_analysis(project_id: int, request: Request, payload: GenerateFromAnalysisRequest | None = None, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    project = project_for_user(project_id, db, current_user)
    analysis = latest_analysis(db, project_id)
    if not analysis:
        return error_response("Project analysis not found", "ANALYSIS_NOT_FOUND", 404)
    options = (payload or GenerateFromAnalysisRequest()).model_dump()
    if options.get("project_profile"):
        analysis.analysis_json = {**(analysis.analysis_json or {}), "project_profile": options["project_profile"]}
    files = generate_from_analysis(db, project, analysis, options, get_user_config_value(db, "github", current_user, "login"))
    ip, ua = request_meta(request)
    record_audit(db, user_id=current_user.id, action="DevOps files generated from analysis", resource_type="project", resource_id=project.id, ip_address=ip, user_agent=ua)
    db.commit()
    return success_response("DevOps files generated from analysis", [GeneratedFileOut.model_validate(file).model_dump(exclude={"content"}) for file in files])


@router.post("/{project_id}/regenerate-file")
def regenerate_file(project_id: int, payload: RegenerateFileRequest, request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    project = project_for_user(project_id, db, current_user)
    analysis = latest_analysis(db, project_id)
    if not analysis:
        return error_response("Project analysis not found", "ANALYSIS_NOT_FOUND", 404)
    try:
        file = regenerate_one_file(db, project, analysis, payload.file_path, get_user_config_value(db, "github", current_user, "login"))
    except ValueError:
        return error_response("Unsupported generated file", "UNSUPPORTED_FILE", 400)
    ip, ua = request_meta(request)
    record_audit(db, user_id=current_user.id, action="Generated file regenerated", resource_type="project", resource_id=project.id, ip_address=ip, user_agent=ua)
    db.commit()
    return success_response("Generated file regenerated", GeneratedFileOut.model_validate(file).model_dump())
