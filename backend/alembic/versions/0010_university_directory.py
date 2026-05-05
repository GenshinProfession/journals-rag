"""University directory table for global university dataset

Revision ID: 0010_university_directory
Revises: 0009_admin_enhancements
Create Date: 2026-05-05
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0010_university_directory"
down_revision = "0009_admin_enhancements"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "university_directory",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(300), nullable=False, index=True),
        sa.Column("country", sa.String(120), nullable=True),
        sa.Column("alpha_two_code", sa.String(4), nullable=True, index=True),
        sa.Column("state_province", sa.String(200), nullable=True),
        sa.Column("domains", postgresql.JSONB(), nullable=True),
        sa.Column("web_pages", postgresql.JSONB(), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true"), index=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("university_directory")
