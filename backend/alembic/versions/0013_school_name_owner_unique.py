"""Replace unique(name) with unique(name, owner_id) on schools

Revision ID: 0013_school_name_owner_unique
Revises: 0012_school_owner_id
Create Date: 2026-05-05
"""

from alembic import op


revision = "0013_school_name_owner_unique"
down_revision = "0012_school_owner_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop old global unique constraint on name
    op.drop_constraint("schools_name_key", "schools", type_="unique")
    # Add composite unique(name, owner_id) — allows same name with different owners
    op.create_unique_constraint("uq_school_name_owner", "schools", ["name", "owner_id"])


def downgrade() -> None:
    op.drop_constraint("uq_school_name_owner", "schools", type_="unique")
    op.create_unique_constraint("schools_name_key", "schools", ["name"])
