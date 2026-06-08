from uuid import UUID

from pydantic import BaseModel, Field


class TemplateSubmissionCreate(BaseModel):
    school_name: str = Field(max_length=255)
    degree_level: str = Field(max_length=30)
    discipline: str | None = Field(default=None, max_length=80)
    citation_style: str | None = Field(default=None, max_length=80)
    notes: str | None = None


class TemplateSubmissionResponse(BaseModel):
    id: UUID
    user_id: UUID
    school_name: str
    degree_level: str
    discipline: str | None = None
    file_name: str
    citation_style: str | None = None
    notes: str | None = None
    status: str
    reviewer_id: UUID | None = None
    review_notes: str | None = None
    token_reward: int | None = None
    school_template_group_id: UUID | None = None
    created_at: str | None = None
    updated_at: str | None = None

    model_config = {"from_attributes": True}


class TemplateSubmissionDetail(BaseModel):
    id: UUID
    user_id: UUID
    school_name: str
    degree_level: str
    discipline: str | None = None
    file_name: str
    citation_style: str | None = None
    notes: str | None = None
    parsed_structure: dict | None = None
    parsed_format_rules: dict | None = None
    parsed_citation_rules: dict | None = None
    parsed_citation_text: str | None = None
    status: str
    reviewer_id: UUID | None = None
    review_notes: str | None = None
    token_reward: int | None = None
    school_template_group_id: UUID | None = None
    created_at: str | None = None
    updated_at: str | None = None

    model_config = {"from_attributes": True}


class TemplateSubmissionReview(BaseModel):
    review_notes: str | None = None
    token_reward: int | None = Field(default=5000, description="Reward in cents (default 50 yuan)")


class TemplateSubmissionListParams(BaseModel):
    status: str | None = None
