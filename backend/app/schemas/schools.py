from uuid import UUID

from pydantic import BaseModel, Field


# ── School (top-level, system-preset) ────────────────────────────────────────

class SchoolResponse(BaseModel):
    id: UUID
    name: str
    university_id: UUID | None = None
    owner_id: UUID | None = None
    country: str | None = None
    logo_url: str | None = None
    enabled: bool
    is_pinned: bool = False
    model_config = {"from_attributes": True}


class SchoolCreate(BaseModel):
    university_id: UUID = Field(description="Must reference an entry in the university directory")
    name: str = Field(max_length=300)
    country: str | None = Field(default=None, max_length=120)


class SchoolUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=300)
    country: str | None = Field(default=None, max_length=120)
    enabled: bool | None = None
    logo_url: str | None = None


# ── Template Group (second layer) ────────────────────────────────────────────

class TemplateGroupCreate(BaseModel):
    school_id: UUID
    degree_level: str = Field(max_length=30)
    discipline: str | None = Field(default=None, max_length=120)
    year: int | None = None
    citation_style: str | None = Field(default=None, max_length=80)
    enabled: bool = True


class TemplateGroupUpdate(BaseModel):
    degree_level: str | None = Field(default=None, max_length=30)
    discipline: str | None = Field(default=None, max_length=120)
    year: int | None = None
    citation_style: str | None = Field(default=None, max_length=80)
    enabled: bool | None = None


class TemplateGroupResponse(BaseModel):
    id: UUID
    school_id: UUID
    degree_level: str
    discipline: str | None = None
    year: int | None = None
    citation_style: str | None = None
    enabled: bool
    has_structure: bool = False
    has_format_rules: bool = False
    has_citation_rules: bool = False
    model_config = {"from_attributes": True}


class TemplateGroupDetail(TemplateGroupResponse):
    """Extended group response with school name for editor header."""
    school_name: str = ""


# ── Template Content (third layer) ───────────────────────────────────────────

class StructurePayload(BaseModel):
    structure_json: dict


class StructureResponse(BaseModel):
    id: UUID
    group_id: UUID
    structure_json: dict
    model_config = {"from_attributes": True}


class FormatRulesPayload(BaseModel):
    rules_json: dict


class FormatRulesResponse(BaseModel):
    id: UUID
    group_id: UUID
    rules_json: dict
    model_config = {"from_attributes": True}


class CitationRulesPayload(BaseModel):
    citation_json: dict | None = None
    citation_text: str | None = None


class CitationRulesResponse(BaseModel):
    id: UUID
    group_id: UUID
    citation_json: dict | None = None
    citation_text: str | None = None
    model_config = {"from_attributes": True}


# ── Writer-facing combined view ──────────────────────────────────────────────

class WriterTemplateOption(BaseModel):
    """Flat option shown to writers when selecting a school template."""
    group_id: UUID
    school_id: UUID
    school_name: str
    degree_level: str
    discipline: str | None = None
    year: int | None = None
    citation_style: str | None = None
    complete: bool = False
    model_config = {"from_attributes": True}


# ── Backward compat alias (old SchoolTemplateResponse) ───────────────────────

class SchoolTemplateResponse(TemplateGroupResponse):
    name: str = ""
