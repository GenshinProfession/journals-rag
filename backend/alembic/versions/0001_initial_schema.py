"""initial schema

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-05-02
"""

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql


revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


UUID = postgresql.UUID(as_uuid=True)


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    ]


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "users",
        sa.Column("username", sa.String(length=100), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_by", UUID, nullable=True),
        sa.Column("id", UUID, nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_username"), "users", ["username"], unique=True)

    op.create_table(
        "model_catalog",
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column("provider", sa.String(length=80), nullable=False),
        sa.Column("provider_model", sa.String(length=160), nullable=False),
        sa.Column("context_window", sa.Integer(), nullable=True),
        sa.Column("input_price_per_1k_cents", sa.BigInteger(), nullable=False),
        sa.Column("output_price_per_1k_cents", sa.BigInteger(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("allowed_scenarios", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("id", UUID, nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "account_wallets",
        sa.Column("user_id", UUID, nullable=False),
        sa.Column("balance_cents", sa.BigInteger(), nullable=False),
        sa.Column("frozen_cents", sa.BigInteger(), nullable=False),
        sa.Column("total_recharged_cents", sa.BigInteger(), nullable=False),
        sa.Column("total_consumed_cents", sa.BigInteger(), nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("user_id"),
    )

    op.create_table(
        "recharge_records",
        sa.Column("user_id", UUID, nullable=False),
        sa.Column("admin_id", UUID, nullable=False),
        sa.Column("amount_cents", sa.BigInteger(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("id", UUID, nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(["admin_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_recharge_records_user_id"), "recharge_records", ["user_id"], unique=False)

    op.create_table(
        "projects",
        sa.Column("user_id", UUID, nullable=False),
        sa.Column("school_id", UUID, nullable=True),
        sa.Column("degree_level", sa.String(length=30), nullable=False),
        sa.Column("discipline", sa.String(length=80), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("abstract", sa.Text(), nullable=True),
        sa.Column("topic", sa.Text(), nullable=True),
        sa.Column("default_model_id", UUID, nullable=True),
        sa.Column("outline", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("word_count_total", sa.Integer(), nullable=False),
        sa.Column("id", UUID, nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(["default_model_id"], ["model_catalog.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_projects_school_id"), "projects", ["school_id"], unique=False)
    op.create_index(op.f("ix_projects_user_id"), "projects", ["user_id"], unique=False)

    op.create_table(
        "ai_usage_records",
        sa.Column("user_id", UUID, nullable=False),
        sa.Column("project_id", UUID, nullable=True),
        sa.Column("model_id", UUID, nullable=True),
        sa.Column("agent_name", sa.String(length=80), nullable=False),
        sa.Column("scenario", sa.String(length=80), nullable=False),
        sa.Column("provider_request_id", sa.String(length=160), nullable=True),
        sa.Column("input_tokens", sa.Integer(), nullable=False),
        sa.Column("output_tokens", sa.Integer(), nullable=False),
        sa.Column("cost_cents", sa.BigInteger(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("id", UUID, nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(["model_id"], ["model_catalog.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_ai_usage_records_project_id"), "ai_usage_records", ["project_id"], unique=False)
    op.create_index(op.f("ix_ai_usage_records_user_id"), "ai_usage_records", ["user_id"], unique=False)

    op.create_table(
        "chapters",
        sa.Column("project_id", UUID, nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("word_count", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("feedback", sa.Text(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("id", UUID, nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_chapters_project_id"), "chapters", ["project_id"], unique=False)

    op.create_table(
        "literature",
        sa.Column("project_id", UUID, nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("authors", sa.Text(), nullable=True),
        sa.Column("year", sa.Integer(), nullable=True),
        sa.Column("journal", sa.String(length=255), nullable=True),
        sa.Column("doi", sa.String(length=255), nullable=True),
        sa.Column("abstract", sa.Text(), nullable=True),
        sa.Column("citation_key", sa.String(length=255), nullable=True),
        sa.Column("file_path", sa.Text(), nullable=True),
        sa.Column("source", sa.String(length=80), nullable=False),
        sa.Column("folder", sa.String(length=255), nullable=True),
        sa.Column("rag_status", sa.String(length=30), nullable=False),
        sa.Column("is_cited", sa.Boolean(), nullable=False),
        sa.Column("id", UUID, nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_literature_project_id"), "literature", ["project_id"], unique=False)

    op.create_table(
        "reference_reviews",
        sa.Column("project_id", UUID, nullable=False),
        sa.Column("user_id", UUID, nullable=False),
        sa.Column("literature_id", UUID, nullable=True),
        sa.Column("model_id", UUID, nullable=True),
        sa.Column("topic_relevance_score", sa.Integer(), nullable=True),
        sa.Column("structure_score", sa.Integer(), nullable=True),
        sa.Column("academic_quality_score", sa.Integer(), nullable=True),
        sa.Column("overall_score", sa.Integer(), nullable=True),
        sa.Column("passed", sa.Boolean(), nullable=False),
        sa.Column("issues", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("report", sa.Text(), nullable=True),
        sa.Column("usage_record_id", UUID, nullable=True),
        sa.Column("id", UUID, nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(["literature_id"], ["literature.id"]),
        sa.ForeignKeyConstraint(["model_id"], ["model_catalog.id"]),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.ForeignKeyConstraint(["usage_record_id"], ["ai_usage_records.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_reference_reviews_project_id"), "reference_reviews", ["project_id"], unique=False)
    op.create_index(op.f("ix_reference_reviews_user_id"), "reference_reviews", ["user_id"], unique=False)

    op.create_table(
        "rag_documents",
        sa.Column("project_id", UUID, nullable=False),
        sa.Column("literature_id", UUID, nullable=True),
        sa.Column("source_type", sa.String(length=80), nullable=False),
        sa.Column("source_path", sa.Text(), nullable=False),
        sa.Column("text_hash", sa.String(length=128), nullable=False),
        sa.Column("chunking_status", sa.String(length=30), nullable=False),
        sa.Column("created_by", UUID, nullable=False),
        sa.Column("id", UUID, nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["literature_id"], ["literature.id"]),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_rag_documents_project_id"), "rag_documents", ["project_id"], unique=False)

    op.create_table(
        "rag_chunks",
        sa.Column("document_id", UUID, nullable=False),
        sa.Column("project_id", UUID, nullable=False),
        sa.Column("literature_id", UUID, nullable=True),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(1536), nullable=True),
        sa.Column("title", sa.String(length=500), nullable=True),
        sa.Column("page_start", sa.Integer(), nullable=True),
        sa.Column("page_end", sa.Integer(), nullable=True),
        sa.Column("token_count", sa.Integer(), nullable=True),
        sa.Column("keywords", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("id", UUID, nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(["document_id"], ["rag_documents.id"]),
        sa.ForeignKeyConstraint(["literature_id"], ["literature.id"]),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_rag_chunks_document_id"), "rag_chunks", ["document_id"], unique=False)
    op.create_index(op.f("ix_rag_chunks_project_id"), "rag_chunks", ["project_id"], unique=False)

    op.create_table(
        "wallet_ledger",
        sa.Column("user_id", UUID, nullable=False),
        sa.Column("type", sa.String(length=30), nullable=False),
        sa.Column("amount_cents", sa.BigInteger(), nullable=False),
        sa.Column("balance_after_cents", sa.BigInteger(), nullable=False),
        sa.Column("related_usage_id", UUID, nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("id", UUID, nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_wallet_ledger_user_id"), "wallet_ledger", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_wallet_ledger_user_id"), table_name="wallet_ledger")
    op.drop_table("wallet_ledger")
    op.drop_index(op.f("ix_rag_chunks_project_id"), table_name="rag_chunks")
    op.drop_index(op.f("ix_rag_chunks_document_id"), table_name="rag_chunks")
    op.drop_table("rag_chunks")
    op.drop_index(op.f("ix_rag_documents_project_id"), table_name="rag_documents")
    op.drop_table("rag_documents")
    op.drop_index(op.f("ix_reference_reviews_user_id"), table_name="reference_reviews")
    op.drop_index(op.f("ix_reference_reviews_project_id"), table_name="reference_reviews")
    op.drop_table("reference_reviews")
    op.drop_index(op.f("ix_literature_project_id"), table_name="literature")
    op.drop_table("literature")
    op.drop_index(op.f("ix_chapters_project_id"), table_name="chapters")
    op.drop_table("chapters")
    op.drop_index(op.f("ix_ai_usage_records_user_id"), table_name="ai_usage_records")
    op.drop_index(op.f("ix_ai_usage_records_project_id"), table_name="ai_usage_records")
    op.drop_table("ai_usage_records")
    op.drop_index(op.f("ix_projects_user_id"), table_name="projects")
    op.drop_index(op.f("ix_projects_school_id"), table_name="projects")
    op.drop_table("projects")
    op.drop_index(op.f("ix_recharge_records_user_id"), table_name="recharge_records")
    op.drop_table("recharge_records")
    op.drop_table("account_wallets")
    op.drop_table("model_catalog")
    op.drop_index(op.f("ix_users_username"), table_name="users")
    op.drop_table("users")
