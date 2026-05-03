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
