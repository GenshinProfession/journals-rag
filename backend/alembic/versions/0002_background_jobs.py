"""background jobs

Revision ID: 0002_background_jobs
Revises: 0001_initial_schema
Create Date: 2026-05-02
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0002_background_jobs"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "background_jobs",
        sa.Column("user_id", UUID, nullable=False),
        sa.Column("project_id", UUID, nullable=True),
        sa.Column("job_type", sa.String(length=80), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("celery_task_id", sa.String(length=160), nullable=True),
        sa.Column("input_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("result_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("id", UUID, nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_background_jobs_celery_task_id"), "background_jobs", ["celery_task_id"])
    op.create_index(op.f("ix_background_jobs_job_type"), "background_jobs", ["job_type"])
    op.create_index(op.f("ix_background_jobs_project_id"), "background_jobs", ["project_id"])
    op.create_index(op.f("ix_background_jobs_status"), "background_jobs", ["status"])
    op.create_index(op.f("ix_background_jobs_user_id"), "background_jobs", ["user_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_background_jobs_user_id"), table_name="background_jobs")
    op.drop_index(op.f("ix_background_jobs_status"), table_name="background_jobs")
    op.drop_index(op.f("ix_background_jobs_project_id"), table_name="background_jobs")
    op.drop_index(op.f("ix_background_jobs_job_type"), table_name="background_jobs")
    op.drop_index(op.f("ix_background_jobs_celery_task_id"), table_name="background_jobs")
    op.drop_table("background_jobs")
