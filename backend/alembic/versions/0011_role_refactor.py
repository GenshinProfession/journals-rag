"""Role refactor: super_admin / org_admin / writer, add users.org_id

Revision ID: 0011_role_refactor
Revises: 0010_university_directory
Create Date: 2026-05-05
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0011_role_refactor"
down_revision = "0010_university_directory"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add org_id column (writer → org_admin FK)
    op.add_column("users", sa.Column(
        "org_id", postgresql.UUID(as_uuid=True), nullable=True,
    ))
    op.create_index("ix_users_org_id", "users", ["org_id"])
    op.create_foreign_key(
        "fk_users_org_id", "users", "users",
        ["org_id"], ["id"], ondelete="SET NULL",
    )

    # 2. Migrate existing role='admin' → 'super_admin'
    op.execute("UPDATE users SET role = 'super_admin' WHERE role = 'admin'")


def downgrade() -> None:
    # Revert role names
    op.execute("UPDATE users SET role = 'admin' WHERE role = 'super_admin'")
    op.execute("UPDATE users SET role = 'admin' WHERE role = 'org_admin'")

    op.drop_constraint("fk_users_org_id", "users", type_="foreignkey")
    op.drop_index("ix_users_org_id", table_name="users")
    op.drop_column("users", "org_id")
