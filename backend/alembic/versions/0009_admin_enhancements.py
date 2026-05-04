"""Admin enhancements + hierarchical chapters: school assignments, pinning, manage_all_schools, chapter level/parent

Revision ID: 0009_admin_enhancements
Revises: 0008_rag_traceability
Create Date: 2026-05-05
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0009_admin_enhancements"
down_revision = "0008_rag_traceability"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    # 1. User.manage_all_schools
    op.add_column("users", sa.Column("manage_all_schools", sa.Boolean(), nullable=False, server_default="false"))

    # 2. School.is_pinned + School.pinned_at
    op.add_column("schools", sa.Column("is_pinned", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("schools", sa.Column("pinned_at", sa.DateTime(), nullable=True))
    op.create_index("ix_schools_is_pinned", "schools", ["is_pinned"])

    # 3. Admin school assignments table
    op.create_table(
        "admin_school_assignments",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("admin_id", UUID, sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("school_id", UUID, sa.ForeignKey("schools.id"), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("admin_id", "school_id", name="uq_admin_school"),
    )

    # 4. Chapter hierarchy: level + parent_id
    op.add_column("chapters", sa.Column("level", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("chapters", sa.Column("parent_id", UUID, sa.ForeignKey("chapters.id"), nullable=True))


def downgrade() -> None:
    op.drop_column("chapters", "parent_id")
    op.drop_column("chapters", "level")
    op.drop_table("admin_school_assignments")
    op.drop_index("ix_schools_is_pinned", table_name="schools")
    op.drop_column("schools", "pinned_at")
    op.drop_column("schools", "is_pinned")
    op.drop_column("users", "manage_all_schools")
