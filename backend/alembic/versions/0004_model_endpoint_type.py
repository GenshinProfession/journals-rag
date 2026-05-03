"""model endpoint type

Revision ID: 0004_model_endpoint_type
Revises: 0003_school_templates
Create Date: 2026-05-02
"""

from alembic import op
import sqlalchemy as sa


revision = "0004_model_endpoint_type"
down_revision = "0003_school_templates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "model_catalog",
        sa.Column("endpoint_type", sa.String(length=40), nullable=False, server_default="openai_chat"),
    )
    op.alter_column("model_catalog", "endpoint_type", server_default=None)


def downgrade() -> None:
    op.drop_column("model_catalog", "endpoint_type")
