"""Template submissions table for user-contributed school templates.

Revision ID: 0010_template_submissions
Revises: 0009_admin_enhancements
Create Date: 2026-06-05
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0010_template_submissions"
down_revision = "0009_admin_enhancements"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "template_submissions",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("school_name", sa.String(255), nullable=False),
        sa.Column("degree_level", sa.String(30), nullable=False),
        sa.Column("discipline", sa.String(80), nullable=True),
        sa.Column("file_path", sa.Text(), nullable=False),
        sa.Column("file_name", sa.String(255), nullable=False),
        sa.Column("citation_style", sa.String(80), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("parsed_structure", postgresql.JSONB(), nullable=True),
        sa.Column("parsed_format_rules", postgresql.JSONB(), nullable=True),
        sa.Column("parsed_citation_rules", postgresql.JSONB(), nullable=True),
        sa.Column("parsed_citation_text", sa.Text(), nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="pending"),
        sa.Column("reviewer_id", UUID, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("review_notes", sa.Text(), nullable=True),
        sa.Column("token_reward", sa.Integer(), nullable=True),
        sa.Column("school_template_group_id", UUID, sa.ForeignKey("school_template_groups.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_template_submissions_status", "template_submissions", ["status"])
    op.create_index("ix_template_submissions_user_id", "template_submissions", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_template_submissions_user_id", table_name="template_submissions")
    op.drop_index("ix_template_submissions_status", table_name="template_submissions")
    op.drop_table("template_submissions")
