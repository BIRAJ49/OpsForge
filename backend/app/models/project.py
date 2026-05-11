import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class AppType(str, enum.Enum):
    frontend = "frontend"
    backend = "backend"
    fullstack = "fullstack"


class DeploymentType(str, enum.Enum):
    docker = "docker"
    kubernetes = "kubernetes"
    helm = "helm"
    gitops = "gitops"


class Environment(str, enum.Enum):
    dev = "dev"
    staging = "staging"
    prod = "prod"


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    app_type: Mapped[AppType] = mapped_column(Enum(AppType), nullable=False)
    stack: Mapped[str] = mapped_column(String(255), nullable=False)
    deployment_type: Mapped[DeploymentType] = mapped_column(Enum(DeploymentType), nullable=False)
    environment: Mapped[Environment] = mapped_column(Enum(Environment), nullable=False)
    monitoring_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    security_scan_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    ai_assistant_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    auto_healing_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    github_repo_url: Mapped[str | None] = mapped_column(String(500))
    gitops_repo_url: Mapped[str | None] = mapped_column(String(500))
    registry_image: Mapped[str | None] = mapped_column(String(500))
    namespace: Mapped[str] = mapped_column(String(120), nullable=False)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    owner = relationship("User", back_populates="projects")
    generated_files = relationship("GeneratedFile", back_populates="project", cascade="all, delete-orphan")
    deployments = relationship("Deployment", back_populates="project", cascade="all, delete-orphan")
    uploaded_projects = relationship("UploadedProject", back_populates="project", cascade="all, delete-orphan")
    analyses = relationship("ProjectAnalysis", back_populates="project", cascade="all, delete-orphan")
