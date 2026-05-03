"""school templates

Revision ID: 0003_school_templates
Revises: 0002_background_jobs
Create Date: 2026-05-02
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0003_school_templates"
down_revision = "0002_background_jobs"
branch_labels = None
depends_on = None


UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "school_templates",
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("degree_level", sa.String(length=30), nullable=True),
        sa.Column("discipline", sa.String(length=120), nullable=True),
        sa.Column("citation_style", sa.String(length=80), nullable=True),
        sa.Column("word_count_min", sa.Integer(), nullable=True),
        sa.Column("word_count_max", sa.Integer(), nullable=True),
        sa.Column("outline_rules", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("formatting_rules", sa.Text(), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("id", UUID, nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_school_templates_degree_level"), "school_templates", ["degree_level"])
    op.create_index(op.f("ix_school_templates_discipline"), "school_templates", ["discipline"])
    op.create_index(op.f("ix_school_templates_enabled"), "school_templates", ["enabled"])
    op.create_index(op.f("ix_school_templates_name"), "school_templates", ["name"], unique=True)
    op.create_foreign_key(
        "fk_projects_school_templates_school_id",
        "projects",
        "school_templates",
        ["school_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_projects_school_templates_school_id", "projects", type_="foreignkey")
    op.drop_index(op.f("ix_school_templates_name"), table_name="school_templates")
    op.drop_index(op.f("ix_school_templates_enabled"), table_name="school_templates")
    op.drop_index(op.f("ix_school_templates_discipline"), table_name="school_templates")
    op.drop_index(op.f("ix_school_templates_degree_level"), table_name="school_templates")
    op.drop_table("school_templates")
