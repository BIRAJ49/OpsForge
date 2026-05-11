from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Deployment(Base):
    __tablename__ = "deployments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    environment: Mapped[str] = mapped_column(String(30), nullable=False)
    namespace: Mapped[str] = mapped_column(String(120), nullable=False)
    image_name: Mapped[str] = mapped_column(String(500), nullable=False)
    image_tag: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(String(80), default="pending", nullable=False)
    replicas: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    deployed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    deployed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    previous_image_tag: Mapped[str | None] = mapped_column(String(120))
    rollback_available: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    project = relationship("Project", back_populates="deployments")
