from uuid import UUID

from pydantic import BaseModel, Field, field_validator
from pydantic.config import ConfigDict


class ModelCatalogCreate(BaseModel):
    display_name: str = Field(min_length=1, max_length=120)
    provider: str = Field(default="ai_gateway", max_length=80)
    provider_model: str = Field(min_length=1, max_length=160)
    endpoint_type: str = Field(default="openai_chat", max_length=40)
    api_key_name: str | None = Field(default=None, max_length=120)
    context_window: int | None = Field(default=None, gt=0)
    input_price_per_1k_cents: int = Field(ge=0)
    output_price_per_1k_cents: int = Field(ge=0)
    allowed_scenarios: list[str] = Field(default_factory=list)
    enabled: bool = True


class ModelCatalogUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=120)
    provider: str | None = Field(default=None, max_length=80)
    provider_model: str | None = Field(default=None, max_length=160)
    endpoint_type: str | None = Field(default=None, max_length=40)
    api_key_name: str | None = Field(default=None, max_length=120)
    context_window: int | None = Field(default=None, gt=0)
    input_price_per_1k_cents: int | None = Field(default=None, ge=0)
    output_price_per_1k_cents: int | None = Field(default=None, ge=0)
    allowed_scenarios: list[str] | None = None
    enabled: bool | None = None
    sort_order: int | None = None


class ModelCatalogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    display_name: str
    provider: str
    provider_model: str
    endpoint_type: str
    api_key_name: str | None
    context_window: int | None
    input_price_per_1k_cents: int
    output_price_per_1k_cents: int
    enabled: bool
    allowed_scenarios: list[str]
    sort_order: int

    @field_validator("allowed_scenarios", mode="before")
    @classmethod
    def default_scenarios(cls, v: object) -> list[str]:
        if v is None:
            return []
        if not isinstance(v, list):
            return []
        return [str(x) for x in v]
