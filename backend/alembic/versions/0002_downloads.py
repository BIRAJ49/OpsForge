"""add downloads table

Revision ID: 0002_downloads
Revises: 0001_initial_schema
Create Date: 2026-05-07
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0002_downloads"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if inspect(bind).has_table("downloads"):
        return
    op.create_table(
        "downloads",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("format", sa.String(length=20), nullable=False),
        sa.Column("ip_address", sa.String(length=80), nullable=True),
        sa.Column("user_agent", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_downloads_id"), "downloads", ["id"], unique=False)
    op.create_index(op.f("ix_downloads_project_id"), "downloads", ["project_id"], unique=False)
    op.create_index(op.f("ix_downloads_user_id"), "downloads", ["user_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    if not inspect(bind).has_table("downloads"):
        return
    op.drop_index(op.f("ix_downloads_user_id"), table_name="downloads")
    op.drop_index(op.f("ix_downloads_project_id"), table_name="downloads")
    op.drop_index(op.f("ix_downloads_id"), table_name="downloads")
    op.drop_table("downloads")
