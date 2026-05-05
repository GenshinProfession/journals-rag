from uuid import UUID

from pydantic import BaseModel, Field


class UniversityResponse(BaseModel):
    id: UUID
    name: str
    country: str | None = None
    alpha_two_code: str | None = None
    state_province: str | None = None
    domains: list[str] | None = None
    web_pages: list[str] | None = None
    enabled: bool

    model_config = {"from_attributes": True}


class UniversityCreate(BaseModel):
    name: str = Field(max_length=300)
    country: str | None = Field(default=None, max_length=120)
    alpha_two_code: str | None = Field(default=None, max_length=4)
    state_province: str | None = Field(default=None, max_length=200)
    domains: list[str] | None = None
    web_pages: list[str] | None = None
    enabled: bool = True


class UniversityUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=300)
    country: str | None = Field(default=None, max_length=120)
    alpha_two_code: str | None = Field(default=None, max_length=4)
    state_province: str | None = Field(default=None, max_length=200)
    domains: list[str] | None = None
    web_pages: list[str] | None = None
    enabled: bool | None = None


class UniversityPage(BaseModel):
    items: list[UniversityResponse]
    total: int
    page: int
    page_size: int
