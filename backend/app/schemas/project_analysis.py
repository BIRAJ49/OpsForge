from datetime import datetime

from pydantic import BaseModel, Field

from app.models.project import DeploymentType, Environment
from app.models.project_analysis import UploadStatus, UploadType


class GithubImportRequest(BaseModel):
    project_name: str = Field(min_length=2, max_length=120)
    description: str | None = None
    github_repo_url: str
    branch_name: str = "main"
    environment: Environment = Environment.dev
    deployment_type: DeploymentType = DeploymentType.gitops
    monitoring_enabled: bool = True
    security_scan_enabled: bool = True
    gitops_enabled: bool = True
    auto_healing_enabled: bool = False


class AnalyzeGithubRequest(BaseModel):
    github_repo_url: str | None = None
    branch_name: str = "main"


class GenerateFromAnalysisRequest(BaseModel):
    generate_docker: bool = True
    generate_kubernetes: bool = True
    generate_helm: bool = True
    generate_github_actions: bool = True
    generate_argocd: bool = True
    generate_terraform: bool = True
    generate_readme: bool = True
    run_security_check: bool = True
    create_deployment_plan: bool = True
    project_profile: dict | None = None


class ProjectProfileUpdateRequest(BaseModel):
    project_profile: dict


class RegenerateFileRequest(BaseModel):
    file_path: str


class UploadedProjectOut(BaseModel):
    id: int
    project_id: int
    owner_id: int
    upload_type: UploadType
    original_filename: str | None
    github_repo_url: str | None
    branch_name: str | None
    file_count: int
    total_size: int
    status: UploadStatus
    error_message: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectAnalysisOut(BaseModel):
    id: int
    project_id: int
    owner_id: int
    detected_project_type: str
    detected_stack: list
    frontend_path: str | None
    backend_path: str | None
    package_manager: str | None
    build_commands: dict
    start_commands: dict
    detected_ports: dict
    detected_databases: list
    detected_cache: list
    detected_env_vars: dict
    existing_devops_files: list
    missing_devops_files: list
    recommended_files: list
    recommended_deployment_strategy: str | None
    risk_score: int
    security_warnings: list
    analysis_json: dict
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AnalysisFileSummaryOut(BaseModel):
    id: int
    analysis_id: int
    file_path: str
    file_type: str | None
    language: str | None
    summary: str | None
    important: bool
    created_at: datetime

    model_config = {"from_attributes": True}
