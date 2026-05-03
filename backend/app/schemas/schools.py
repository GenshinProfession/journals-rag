from uuid import UUID

from pydantic import BaseModel, Field


class SchoolTemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    degree_level: str | None = Field(default=None, max_length=30)
    discipline: str | None = Field(default=None, max_length=120)
    citation_style: str | None = Field(default=None, max_length=80)
    word_count_min: int | None = Field(default=None, ge=0)
    word_count_max: int | None = Field(default=None, ge=0)
    outline_rules: dict | None = None
    formatting_rules: str | None = None
    enabled: bool = True


class SchoolTemplateUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    degree_level: str | None = Field(default=None, max_length=30)
    discipline: str | None = Field(default=None, max_length=120)
    citation_style: str | None = Field(default=None, max_length=80)
    word_count_min: int | None = Field(default=None, ge=0)
    word_count_max: int | None = Field(default=None, ge=0)
    outline_rules: dict | None = None
    formatting_rules: str | None = None
    enabled: bool | None = None


class SchoolTemplateResponse(BaseModel):
    id: UUID
    name: str
    degree_level: str | None
    discipline: str | None
    citation_style: str | None
    word_count_min: int | None
    word_count_max: int | None
    outline_rules: dict | None
    formatting_rules: str | None
    enabled: bool

    model_config = {"from_attributes": True}
