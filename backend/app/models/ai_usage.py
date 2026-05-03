from datetime import datetime
from uuid import UUID

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class AIUsageRecord(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "ai_usage_records"

    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"), index=True)
    project_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), index=True)
    model_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("model_catalog.id"))
    agent_name: Mapped[str] = mapped_column(String(80))
    scenario: Mapped[str] = mapped_column(String(80))
    provider_request_id: Mapped[str | None] = mapped_column(String(160))
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_cents: Mapped[int] = mapped_column(BigInteger, default=0)
    status: Mapped[str] = mapped_column(String(30), default="pending")
    error: Mapped[str | None] = mapped_column(Text)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)
