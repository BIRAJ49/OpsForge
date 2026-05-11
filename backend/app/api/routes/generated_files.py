from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissions import get_current_user, project_for_user, request_meta
from app.core.response import success_response
from app.models.download import Download
from app.models.generated_file import GeneratedFile
from app.models.project import Project
from app.schemas.generated_file import GeneratedFileOut
from app.services.audit_service import record_audit
from app.services.generator_service import generate_files
from app.services.integration_service import get_user_config_value

router = APIRouter(tags=["generated-files"])


def _tools_for(project: Project) -> list[str]:
    base = ["Docker", "GitHub Actions", "README"]
    if project.deployment_type.value in {"kubernetes", "helm", "gitops"}:
        base.extend(["Kubernetes", "Helm", "Argo CD"])
    if project.deployment_type.value == "docker":
        base.append("Docker Compose")
    if project.security_scan_enabled:
        base.append("Trivy")
    if project.monitoring_enabled:
        base.append("Monitoring")
    if project.auto_healing_enabled:
        base.append("Self-Healing Rules")
    return list(dict.fromkeys(base))


def _result_for(project: Project, files: list[GeneratedFile]) -> dict:
    title = project.name.replace("-", " ").title()
    return {
        "project": {
            "id": project.id,
            "name": project.name,
            "title": title,
            "project_type": project.deployment_type.value,
            "difficulty": "Intermediate",
            "created_at": project.created_at,
        },
        "title": title,
        "projectType": project.deployment_type.value.title(),
        "difficulty": "Intermediate",
        "requirement": project.description or "Generated from OpsForge project settings.",
        "overview": project.description or f"A production-style DevOps project for {project.name}.",
        "architecture": "The project separates application runtime, infrastructure manifests, CI/CD automation, GitOps deployment state, and operational documentation.",
        "tools": _tools_for(project),
        "steps": [
            "Review generated application and infrastructure files.",
            "Configure required secrets and environment values.",
            "Push generated files to the source repository.",
            "Run CI/CD to build and publish the container image.",
            "Deploy through Kubernetes or GitOps and verify health signals.",
        ],
        "folderStructure": sorted({file.file_path.split('/')[0] + "/" if "/" in file.file_path else file.file_path for file in files}),
        "files": {file.file_path or file.file_name: file.content for file in files},
    }


@router.post("/projects/{project_id}/generate")
def generate(project_id: int, request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    project = project_for_user(project_id, db, current_user)
    files = generate_files(db, project, get_user_config_value(db, "github", current_user, "login"))
    ip, ua = request_meta(request)
    record_audit(db, user_id=current_user.id, action="File generation", resource_type="project", resource_id=project.id, ip_address=ip, user_agent=ua)
    db.commit()
    return success_response("DevOps files generated successfully", [GeneratedFileOut.model_validate(file).model_dump(exclude={"content"}) for file in files])


@router.get("/projects/{project_id}/generated-files")
def project_files(project_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    project_for_user(project_id, db, current_user)
    files = db.scalars(select(GeneratedFile).where(GeneratedFile.project_id == project_id).order_by(GeneratedFile.file_path)).all()
    return success_response("Generated files loaded", [GeneratedFileOut.model_validate(file).model_dump(exclude={"content"}) for file in files])


@router.get("/projects/{project_id}/result")
def project_result(project_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    project = project_for_user(project_id, db, current_user)
    files = _project_files(db, project.id, current_user)
    db.commit()
    return success_response("Generated project result loaded", _result_for(project, list(files)))


@router.get("/generated-files/{file_id}")
def get_file(file_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    file = db.get(GeneratedFile, file_id)
    if not file:
        raise HTTPException(status_code=404, detail="Generated file not found")
    project_for_user(file.project_id, db, current_user)
    return success_response("Generated file loaded", GeneratedFileOut.model_validate(file).model_dump())


@router.get("/generated-files/{file_id}/download")
def download_file(file_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    file = db.get(GeneratedFile, file_id)
    if not file:
        raise HTTPException(status_code=404, detail="Generated file not found")
    project_for_user(file.project_id, db, current_user)
    return Response(
        content=file.content,
        media_type="text/plain",
        headers={"Content-Disposition": f'attachment; filename="{file.file_name}"'},
    )


def _project_files(db: Session, project_id: int, current_user=None):
    files = db.scalars(select(GeneratedFile).where(GeneratedFile.project_id == project_id).order_by(GeneratedFile.file_path)).all()
    if not files:
        project = db.get(Project, project_id)
        if project:
            github_username = get_user_config_value(db, "github", current_user, "login") if current_user else None
            files = generate_files(db, project, github_username)
    return files


def _record_download(db: Session, project: Project, current_user, request: Request, format_: str) -> None:
    ip, ua = request_meta(request)
    db.add(Download(user_id=current_user.id, project_id=project.id, format=format_, ip_address=ip, user_agent=ua))


@router.get("/projects/{project_id}/download/zip")
def download_project_zip(project_id: int, request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    project = project_for_user(project_id, db, current_user)
    files = _project_files(db, project.id, current_user)
    archive = BytesIO()
    with ZipFile(archive, "w", ZIP_DEFLATED) as zip_file:
        for file in files:
            zip_file.writestr(file.file_path or file.file_name, file.content)
    ip, ua = request_meta(request)
    _record_download(db, project, current_user, request, "zip")
    record_audit(db, user_id=current_user.id, action="Project ZIP download", resource_type="project", resource_id=project.id, ip_address=ip, user_agent=ua)
    db.commit()
    archive.seek(0)
    return Response(
        content=archive.read(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{project.name}.zip"'},
    )


def _pdf_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _simple_pdf(title: str, lines: list[str]) -> bytes:
    content_lines = ["BT", "/F1 12 Tf", "50 780 Td", f"({_pdf_escape(title)}) Tj"]
    for line in lines[:52]:
        content_lines.append("0 -14 Td")
        content_lines.append(f"({_pdf_escape(line[:110])}) Tj")
    content_lines.append("ET")
    stream = "\n".join(content_lines).encode()
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
    ]
    pdf = BytesIO()
    pdf.write(b"%PDF-1.4\n")
    offsets = []
    for index, obj in enumerate(objects, start=1):
        offsets.append(pdf.tell())
        pdf.write(f"{index} 0 obj\n".encode() + obj + b"\nendobj\n")
    xref = pdf.tell()
    pdf.write(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode())
    for offset in offsets:
        pdf.write(f"{offset:010d} 00000 n \n".encode())
    pdf.write(f"trailer << /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
    return pdf.getvalue()


@router.get("/projects/{project_id}/download/pdf")
def download_project_pdf(project_id: int, request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    project = project_for_user(project_id, db, current_user)
    files = _project_files(db, project.id, current_user)
    lines = [
        project.description or "Generated DevOps project",
        f"Stack: {project.stack}",
        f"Deployment: {project.deployment_type.value}",
        f"Environment: {project.environment.value}",
        "",
        "Generated files:",
        *[f"- {file.file_path}" for file in files],
    ]
    ip, ua = request_meta(request)
    _record_download(db, project, current_user, request, "pdf")
    record_audit(db, user_id=current_user.id, action="Project PDF download", resource_type="project", resource_id=project.id, ip_address=ip, user_agent=ua)
    db.commit()
    return Response(
        content=_simple_pdf(project.name, lines),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{project.name}.pdf"'},
    )
