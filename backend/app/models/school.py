from sqlalchemy import Boolean, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class SchoolTemplate(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "school_templates"

    name: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    degree_level: Mapped[str | None] = mapped_column(String(30), index=True)
    discipline: Mapped[str | None] = mapped_column(String(120), index=True)
    citation_style: Mapped[str | None] = mapped_column(String(80))
    word_count_min: Mapped[int | None] = mapped_column(Integer)
    word_count_max: Mapped[int | None] = mapped_column(Integer)
    outline_rules: Mapped[dict | None] = mapped_column(JSONB)
    formatting_rules: Mapped[str | None] = mapped_column(Text)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
