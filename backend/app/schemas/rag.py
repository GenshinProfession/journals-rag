from uuid import UUID

from pydantic import BaseModel, Field


class ReferenceReviewRequest(BaseModel):
    literature_id: UUID
    model_id: UUID


class ChunkRequest(BaseModel):
    literature_id: UUID
    model_id: UUID
    chunk_char_limit: int = Field(default=1800, ge=400, le=16000)
    overlap: int = Field(default=200, ge=0, le=2000)
    text_override: str | None = Field(default=None, max_length=2_000_000)


class ChunkConfirmRequest(BaseModel):
    chunk_ids: list[UUID]


class RAGSearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=8000)
    limit: int = Field(default=8, ge=1, le=32)
