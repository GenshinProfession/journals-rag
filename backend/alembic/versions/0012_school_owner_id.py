"""Add schools.owner_id for org-level template isolation

Revision ID: 0012_school_owner_id
Revises: 0011_role_refactor
Create Date: 2026-05-05
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0012_school_owner_id"
down_revision = "0011_role_refactor"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("schools", sa.Column(
        "owner_id", postgresql.UUID(as_uuid=True), nullable=True,
    ))
    op.create_index("ix_schools_owner_id", "schools", ["owner_id"])
    op.create_foreign_key(
        "fk_schools_owner_id", "schools", "users",
        ["owner_id"], ["id"], ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_schools_owner_id", "schools", type_="foreignkey")
    op.drop_index("ix_schools_owner_id", table_name="schools")
    op.drop_column("schools", "owner_id")
