"""RAG traceability: generation_rag_hits table + topic_summary column

Revision ID: 0008_rag_traceability
Revises: 0007_school_template_tree
Create Date: 2026-05-05
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0008_rag_traceability"
down_revision = "0007_school_template_tree"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    # 1. Add topic_summary to rag_chunks
    op.add_column("rag_chunks", sa.Column("topic_summary", sa.String(500), nullable=True))

    # 2. Create generation_rag_hits table
    op.create_table(
        "generation_rag_hits",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("chapter_id", UUID, sa.ForeignKey("chapters.id"), nullable=False, index=True),
        sa.Column("chunk_id", UUID, sa.ForeignKey("rag_chunks.id"), nullable=False, index=True),
        sa.Column("literature_id", UUID, sa.ForeignKey("literature.id"), nullable=True),
        sa.Column("similarity_score", sa.Float(), nullable=True),
        sa.Column("chunk_content_preview", sa.Text(), nullable=True),
        sa.Column("source", sa.String(30), nullable=False, server_default="auto"),
        sa.Column("generation_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("accepted", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("generation_rag_hits")
    op.drop_column("rag_chunks", "topic_summary")
