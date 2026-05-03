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
    default_model_id: UUID | None
    status: str
    word_count_total: int

    model_config = {"from_attributes": True}


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

    model_config = {"from_attributes": True}


class ChapterUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    content: str | None = None
    status: str | None = Field(default=None, max_length=30)


class ChapterGenerateRequest(BaseModel):
    model_id: UUID | None = None
    target_words: int = Field(default=1200, ge=300, le=8000)


class ChapterReviewRequest(BaseModel):
    model_id: UUID | None = None


class ChapterRewriteRequest(BaseModel):
    model_id: UUID | None = None
    instruction: str | None = Field(default=None, max_length=2000)
