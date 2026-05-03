"""Add user nickname field

Revision ID: 0006_user_nickname
Revises: 0005_model_api_key_name
Create Date: 2026-05-04
"""
from alembic import op
import sqlalchemy as sa

revision = "0006_user_nickname"
down_revision = "0005_model_api_key_name"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("nickname", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "nickname")
