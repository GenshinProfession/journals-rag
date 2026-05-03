from sqlalchemy import BigInteger, Boolean, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class ModelCatalog(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "model_catalog"

    display_name: Mapped[str] = mapped_column(String(120))
    provider: Mapped[str] = mapped_column(String(80), default="ai_gateway")
    provider_model: Mapped[str] = mapped_column(String(160))
    endpoint_type: Mapped[str] = mapped_column(String(40), default="openai_chat")
    api_key_name: Mapped[str | None] = mapped_column(String(120))
    context_window: Mapped[int | None] = mapped_column(Integer)
    input_price_per_1k_cents: Mapped[int] = mapped_column(BigInteger)
    output_price_per_1k_cents: Mapped[int] = mapped_column(BigInteger)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    allowed_scenarios: Mapped[list[str]] = mapped_column(JSONB, default=list)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
