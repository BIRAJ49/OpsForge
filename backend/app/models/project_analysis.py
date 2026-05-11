import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class UploadType(str, enum.Enum):
    zip = "zip"
    github = "github"


class UploadStatus(str, enum.Enum):
    uploaded = "uploaded"
    extracted = "extracted"
    analyzed = "analyzed"
    failed = "failed"


class UploadedProject(Base):
    __tablename__ = "uploaded_projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    upload_type: Mapped[UploadType] = mapped_column(Enum(UploadType), nullable=False)
    original_filename: Mapped[str | None] = mapped_column(String(500))
    github_repo_url: Mapped[str | None] = mapped_column(String(500))
    branch_name: Mapped[str | None] = mapped_column(String(120))
    file_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_size: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[UploadStatus] = mapped_column(Enum(UploadStatus), default=UploadStatus.uploaded, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    project = relationship("Project", back_populates="uploaded_projects")
    owner = relationship("User")


class ProjectAnalysis(Base):
    __tablename__ = "project_analyses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    detected_project_type: Mapped[str] = mapped_column(String(80), nullable=False)
    detected_stack: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    frontend_path: Mapped[str | None] = mapped_column(String(500))
    backend_path: Mapped[str | None] = mapped_column(String(500))
    package_manager: Mapped[str | None] = mapped_column(String(120))
    build_commands: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    start_commands: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    detected_ports: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    detected_databases: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    detected_cache: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    detected_env_vars: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    existing_devops_files: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    missing_devops_files: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    recommended_files: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    recommended_deployment_strategy: Mapped[str | None] = mapped_column(Text)
    risk_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    security_warnings: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    analysis_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    project = relationship("Project", back_populates="analyses")
    owner = relationship("User")
    files = relationship("AnalysisFileSummary", back_populates="analysis", cascade="all, delete-orphan")


class AnalysisFileSummary(Base):
    __tablename__ = "analysis_file_summaries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    analysis_id: Mapped[int] = mapped_column(ForeignKey("project_analyses.id", ondelete="CASCADE"), nullable=False, index=True)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_type: Mapped[str | None] = mapped_column(String(80))
    language: Mapped[str | None] = mapped_column(String(80))
    summary: Mapped[str | None] = mapped_column(Text)
    important: Mapped[bool] = mapped_column(default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    analysis = relationship("ProjectAnalysis", back_populates="files")
