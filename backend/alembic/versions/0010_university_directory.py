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
    # 1. Create the university directory table
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

    # 2. Link schools → university_directory (optional FK)
    op.add_column("schools", sa.Column(
        "university_id", postgresql.UUID(as_uuid=True), nullable=True,
    ))
    op.create_index("ix_schools_university_id", "schools", ["university_id"])
    op.create_foreign_key(
        "fk_schools_university_id", "schools", "university_directory",
        ["university_id"], ["id"], ondelete="SET NULL",
    )

    # 3. Widen schools.name (160→300) and schools.country (10→120) to match directory data
    op.alter_column("schools", "name", type_=sa.String(300), existing_type=sa.String(160))
    op.alter_column("schools", "country", type_=sa.String(120), existing_type=sa.String(10))


def downgrade() -> None:
    op.alter_column("schools", "country", type_=sa.String(10), existing_type=sa.String(120))
    op.alter_column("schools", "name", type_=sa.String(160), existing_type=sa.String(300))
    op.drop_constraint("fk_schools_university_id", "schools", type_="foreignkey")
    op.drop_index("ix_schools_university_id", table_name="schools")
    op.drop_column("schools", "university_id")
    op.drop_table("university_directory")
