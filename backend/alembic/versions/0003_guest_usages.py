"""add guest usage table

Revision ID: 0003_guest_usages
Revises: 0002_downloads
Create Date: 2026-05-07
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0003_guest_usages"
down_revision = "0002_downloads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if inspect(bind).has_table("guest_usages"):
        return
    op.create_table(
        "guest_usages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("guest_key", sa.String(length=255), nullable=False),
        sa.Column("ip_address", sa.String(length=80), nullable=True),
        sa.Column("generation_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("guest_key", name="uq_guest_usages_guest_key"),
    )
    op.create_index(op.f("ix_guest_usages_guest_key"), "guest_usages", ["guest_key"], unique=False)
    op.create_index(op.f("ix_guest_usages_id"), "guest_usages", ["id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    if not inspect(bind).has_table("guest_usages"):
        return
    op.drop_index(op.f("ix_guest_usages_id"), table_name="guest_usages")
    op.drop_index(op.f("ix_guest_usages_guest_key"), table_name="guest_usages")
    op.drop_table("guest_usages")
