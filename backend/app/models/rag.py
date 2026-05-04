from uuid import UUID

from pgvector.sqlalchemy import Vector
from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

EMBEDDING_DIM = 1536


class Literature(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "literature"

    project_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("projects.id"), index=True)
    title: Mapped[str] = mapped_column(String(500))
    authors: Mapped[str | None] = mapped_column(Text)
    year: Mapped[int | None] = mapped_column(Integer)
    journal: Mapped[str | None] = mapped_column(String(255))
    doi: Mapped[str | None] = mapped_column(String(255))
    abstract: Mapped[str | None] = mapped_column(Text)
    citation_key: Mapped[str | None] = mapped_column(String(255))
    file_path: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(80), default="manual")
    folder: Mapped[str | None] = mapped_column(String(255))
    rag_status: Mapped[str] = mapped_column(String(30), default="pending")
    is_cited: Mapped[bool] = mapped_column(Boolean, default=False)


class ReferenceReview(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "reference_reviews"

    project_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("projects.id"), index=True)
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"), index=True)
    literature_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("literature.id"))
    model_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("model_catalog.id"))
    topic_relevance_score: Mapped[int | None] = mapped_column(Integer)
    structure_score: Mapped[int | None] = mapped_column(Integer)
    academic_quality_score: Mapped[int | None] = mapped_column(Integer)
    overall_score: Mapped[int | None] = mapped_column(Integer)
    passed: Mapped[bool] = mapped_column(Boolean, default=False)
    issues: Mapped[list[dict] | None] = mapped_column(JSONB)
    report: Mapped[str | None] = mapped_column(Text)
    usage_record_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("ai_usage_records.id"))


class RAGDocument(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "rag_documents"

    project_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("projects.id"), index=True)
    literature_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("literature.id"))
    source_type: Mapped[str] = mapped_column(String(80))
    source_path: Mapped[str] = mapped_column(Text)
    text_hash: Mapped[str] = mapped_column(String(128))
    chunking_status: Mapped[str] = mapped_column(String(30), default="draft")
    created_by: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))


class RAGChunk(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "rag_chunks"

    document_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("rag_documents.id"), index=True)
    project_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("projects.id"), index=True)
    literature_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("literature.id"))
    chunk_index: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(EMBEDDING_DIM), nullable=True)
    title: Mapped[str | None] = mapped_column(String(500))
    page_start: Mapped[int | None] = mapped_column(Integer)
    page_end: Mapped[int | None] = mapped_column(Integer)
    token_count: Mapped[int | None] = mapped_column(Integer)
    keywords: Mapped[list[str] | None] = mapped_column(JSONB)
    topic_summary: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(30), default="draft")
    version: Mapped[int] = mapped_column(Integer, default=1)


class GenerationRAGHit(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Audit trail: which RAG chunks were fed to the LLM for a chapter generation."""
    __tablename__ = "generation_rag_hits"

    chapter_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("chapters.id"), index=True)
    chunk_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("rag_chunks.id"), index=True)
    literature_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("literature.id"))
    similarity_score: Mapped[float | None] = mapped_column(Float)
    chunk_content_preview: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(30), default="auto")
    generation_version: Mapped[int] = mapped_column(Integer, default=1)
    accepted: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
