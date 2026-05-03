"""model api key name

Revision ID: 0005_model_api_key_name
Revises: 0004_model_endpoint_type
Create Date: 2026-05-02
"""

from alembic import op
import sqlalchemy as sa


revision = "0005_model_api_key_name"
down_revision = "0004_model_endpoint_type"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("model_catalog", sa.Column("api_key_name", sa.String(length=120), nullable=True))


def downgrade() -> None:
    op.drop_column("model_catalog", "api_key_name")
