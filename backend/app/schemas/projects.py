from uuid import UUID

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    degree_level: str = Field(max_length=30, description="bachelor | master | doctor")
    discipline: str = Field(max_length=80)
    title: str | None = Field(default=None, max_length=255)
    topic: str | None = None
    school_id: UUID | None = None
    default_model_id: UUID | None = None


class ProjectResponse(BaseModel):
    id: UUID
    user_id: UUID
    school_id: UUID | None
    degree_level: str
    discipline: str
    title: str | None
    topic: str | None
    abstract: str | None = None
    default_model_id: UUID | None
    status: str
    word_count_total: int

    model_config = {"from_attributes": True}


class ProjectUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    topic: str | None = None
    abstract: str | None = None


class OutlineGenerateRequest(BaseModel):
    model_id: UUID | None = None


class ChapterResponse(BaseModel):
    id: UUID
    project_id: UUID
    title: str
    order_index: int
    content: str | None
    word_count: int
    status: str
    feedback: str | None
    version: int
    level: int = 1
    parent_id: UUID | None = None

    model_config = {"from_attributes": True}


class ChapterCreate(BaseModel):
    title: str = Field(max_length=255)
    level: int = Field(default=1, ge=1, le=4)
    parent_id: UUID | None = None
    order_index: int | None = Field(default=None, description="Insert position. None = append at end.")


class ChapterUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    content: str | None = None
    status: str | None = Field(default=None, max_length=30)
    level: int | None = Field(default=None, ge=1, le=4)
    parent_id: UUID | None = None


class ChaptersReorderRequest(BaseModel):
    order: list[UUID] = Field(description="Ordered list of chapter IDs, position = new order_index.")


class ChapterGenerateRequest(BaseModel):
    model_id: UUID | None = None
    target_words: int = Field(default=1200, ge=300, le=8000)
    selected_chunk_ids: list[UUID] | None = Field(
        default=None,
        description="Manually chosen RAG chunk IDs. When provided, these are used instead of auto-search.",
    )
    auto_search_limit: int = Field(
        default=8, ge=1, le=32,
        description="Number of auto-retrieved RAG chunks when selected_chunk_ids is empty.",
    )


class ChapterReviewRequest(BaseModel):
    model_id: UUID | None = None


class ChapterRewriteRequest(BaseModel):
    model_id: UUID | None = None
    instruction: str | None = Field(default=None, max_length=2000)


class RAGHitItem(BaseModel):
    hit_id: UUID
    chunk_id: UUID
    literature_id: UUID | None
    literature_title: str | None = None
    topic_summary: str | None = None
    similarity_score: float | None
    source: str
    content_preview: str | None
    accepted: bool | None = None


class ChapterGenerateResponse(BaseModel):
    id: UUID
    project_id: UUID
    title: str
    order_index: int
    content: str | None
    word_count: int
    status: str
    feedback: str | None
    version: int
    level: int = 1
    parent_id: UUID | None = None
    rag_hits: list[RAGHitItem] = []

    model_config = {"from_attributes": True}


class ChapterAcceptRequest(BaseModel):
    accepted: bool = Field(description="True to land/accept the generated content, False to reject.")
    rejected_chunk_ids: list[UUID] | None = Field(
        default=None,
        description="Specific chunk IDs to mark as irrelevant (optional, for fine-grained feedback).",
    )
