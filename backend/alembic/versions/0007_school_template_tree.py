"""school template 3-layer tree: schools → template_groups → structure/format/citation

Revision ID: 0007_school_template_tree
Revises: 0006_user_nickname
Create Date: 2026-05-04
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "0007_school_template_tree"
down_revision = "0006_user_nickname"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1) schools (top level, system-preset)
    op.create_table(
        "schools",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(160), nullable=False, unique=True),
        sa.Column("country", sa.String(10), nullable=True),
        sa.Column("logo_url", sa.String(500), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_schools_name", "schools", ["name"], unique=True)
    op.create_index("ix_schools_enabled", "schools", ["enabled"])

    # 2) school_template_groups (second layer)
    op.create_table(
        "school_template_groups",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("school_id", UUID(as_uuid=True), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("degree_level", sa.String(30), nullable=False),
        sa.Column("discipline", sa.String(120), nullable=True),
        sa.Column("year", sa.Integer(), nullable=True),
        sa.Column("citation_style", sa.String(80), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("school_id", "degree_level", "discipline", "year", name="uq_template_group_dim"),
    )
    op.create_index("ix_stg_school_id", "school_template_groups", ["school_id"])
    op.create_index("ix_stg_enabled", "school_template_groups", ["enabled"])

    # 3) template_structures
    op.create_table(
        "template_structures",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("group_id", UUID(as_uuid=True), sa.ForeignKey("school_template_groups.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("structure_json", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )

    # 4) template_format_rules
    op.create_table(
        "template_format_rules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("group_id", UUID(as_uuid=True), sa.ForeignKey("school_template_groups.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("rules_json", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )

    # 5) template_citation_rules
    op.create_table(
        "template_citation_rules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("group_id", UUID(as_uuid=True), sa.ForeignKey("school_template_groups.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("citation_json", JSONB, nullable=True),
        sa.Column("citation_text", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )

    # 6) Migrate projects.school_id FK from school_templates → school_template_groups
    op.drop_constraint("fk_projects_school_templates_school_id", "projects", type_="foreignkey")
    op.create_foreign_key(
        "fk_projects_template_group_id",
        "projects",
        "school_template_groups",
        ["school_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_projects_template_group_id", "projects", type_="foreignkey")
    op.create_foreign_key(
        "fk_projects_school_templates_school_id",
        "projects",
        "school_templates",
        ["school_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.drop_table("template_citation_rules")
    op.drop_table("template_format_rules")
    op.drop_table("template_structures")
    op.drop_table("school_template_groups")
    op.drop_table("schools")
