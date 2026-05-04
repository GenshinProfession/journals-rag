from uuid import UUID

from pydantic import BaseModel, Field


class LiteratureCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    authors: str | None = Field(default=None, max_length=2000)
    year: int | None = Field(default=None)
    journal: str | None = Field(default=None, max_length=255)
    doi: str | None = Field(default=None, max_length=255)
    abstract: str | None = None
    citation_key: str | None = Field(default=None, max_length=255)
    folder: str | None = Field(default=None, max_length=255)
    body_text: str | None = Field(
        default=None,
        description="Plain text fallback when PDF is unavailable; chunked from this field.",
        max_length=2_000_000,
    )


class LiteratureResponse(BaseModel):
    id: UUID
    title: str
    authors: str | None
    year: int | None
    journal: str | None
    doi: str | None
    abstract: str | None
    source: str
    folder: str | None
    rag_status: str
    is_cited: bool
    relevance_score: int | None = None
    relevance_recommendation: str | None = None

    model_config = {"from_attributes": True}


class LiteratureRelevanceRequest(BaseModel):
    literature_id: UUID
    model_id: UUID | None = None


class LiteratureSearchRequest(BaseModel):
    """Paid literature search — system searches academic databases for the user."""
    query: str = Field(min_length=2, max_length=500)
    max_results: int = Field(default=10, ge=1, le=50)
    model_id: UUID | None = None
