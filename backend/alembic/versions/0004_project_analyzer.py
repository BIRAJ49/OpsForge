"""add project analyzer tables

Revision ID: 0004_project_analyzer
Revises: 0003_guest_usages
Create Date: 2026-05-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0004_project_analyzer"
down_revision = "0003_guest_usages"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("uploaded_projects"):
        op.create_table(
            "uploaded_projects",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("project_id", sa.Integer(), nullable=False),
            sa.Column("owner_id", sa.Integer(), nullable=False),
            sa.Column("upload_type", sa.Enum("zip", "github", name="uploadtype"), nullable=False),
            sa.Column("original_filename", sa.String(length=500), nullable=True),
            sa.Column("github_repo_url", sa.String(length=500), nullable=True),
            sa.Column("branch_name", sa.String(length=120), nullable=True),
            sa.Column("file_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("total_size", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("status", sa.Enum("uploaded", "extracted", "analyzed", "failed", name="uploadstatus"), nullable=False),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_uploaded_projects_id"), "uploaded_projects", ["id"], unique=False)
        op.create_index(op.f("ix_uploaded_projects_owner_id"), "uploaded_projects", ["owner_id"], unique=False)
        op.create_index(op.f("ix_uploaded_projects_project_id"), "uploaded_projects", ["project_id"], unique=False)

    if not inspector.has_table("project_analyses"):
        op.create_table(
            "project_analyses",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("project_id", sa.Integer(), nullable=False),
            sa.Column("owner_id", sa.Integer(), nullable=False),
            sa.Column("detected_project_type", sa.String(length=80), nullable=False),
            sa.Column("detected_stack", sa.JSON(), nullable=False),
            sa.Column("frontend_path", sa.String(length=500), nullable=True),
            sa.Column("backend_path", sa.String(length=500), nullable=True),
            sa.Column("package_manager", sa.String(length=120), nullable=True),
            sa.Column("build_commands", sa.JSON(), nullable=False),
            sa.Column("start_commands", sa.JSON(), nullable=False),
            sa.Column("detected_ports", sa.JSON(), nullable=False),
            sa.Column("detected_databases", sa.JSON(), nullable=False),
            sa.Column("detected_cache", sa.JSON(), nullable=False),
            sa.Column("detected_env_vars", sa.JSON(), nullable=False),
            sa.Column("existing_devops_files", sa.JSON(), nullable=False),
            sa.Column("missing_devops_files", sa.JSON(), nullable=False),
            sa.Column("recommended_files", sa.JSON(), nullable=False),
            sa.Column("recommended_deployment_strategy", sa.Text(), nullable=True),
            sa.Column("risk_score", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("security_warnings", sa.JSON(), nullable=False),
            sa.Column("analysis_json", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_project_analyses_id"), "project_analyses", ["id"], unique=False)
        op.create_index(op.f("ix_project_analyses_owner_id"), "project_analyses", ["owner_id"], unique=False)
        op.create_index(op.f("ix_project_analyses_project_id"), "project_analyses", ["project_id"], unique=False)

    if not inspector.has_table("analysis_file_summaries"):
        op.create_table(
            "analysis_file_summaries",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("analysis_id", sa.Integer(), nullable=False),
            sa.Column("file_path", sa.String(length=500), nullable=False),
            sa.Column("file_type", sa.String(length=80), nullable=True),
            sa.Column("language", sa.String(length=80), nullable=True),
            sa.Column("summary", sa.Text(), nullable=True),
            sa.Column("important", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.ForeignKeyConstraint(["analysis_id"], ["project_analyses.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_analysis_file_summaries_analysis_id"), "analysis_file_summaries", ["analysis_id"], unique=False)
        op.create_index(op.f("ix_analysis_file_summaries_id"), "analysis_file_summaries", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_analysis_file_summaries_id"), table_name="analysis_file_summaries")
    op.drop_index(op.f("ix_analysis_file_summaries_analysis_id"), table_name="analysis_file_summaries")
    op.drop_table("analysis_file_summaries")
    op.drop_index(op.f("ix_project_analyses_project_id"), table_name="project_analyses")
    op.drop_index(op.f("ix_project_analyses_owner_id"), table_name="project_analyses")
    op.drop_index(op.f("ix_project_analyses_id"), table_name="project_analyses")
    op.drop_table("project_analyses")
    op.drop_index(op.f("ix_uploaded_projects_project_id"), table_name="uploaded_projects")
    op.drop_index(op.f("ix_uploaded_projects_owner_id"), table_name="uploaded_projects")
    op.drop_index(op.f("ix_uploaded_projects_id"), table_name="uploaded_projects")
    op.drop_table("uploaded_projects")
    op.execute("DROP TYPE IF EXISTS uploadstatus")
    op.execute("DROP TYPE IF EXISTS uploadtype")
