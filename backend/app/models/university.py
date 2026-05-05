from sqlalchemy import Boolean, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class UniversityDirectory(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Global university directory – seeded from world_universities_and_domains.json,
    editable by admins.  Independent from the School model which holds template config."""

    __tablename__ = "university_directory"

    name: Mapped[str] = mapped_column(String(300), index=True)
    country: Mapped[str | None] = mapped_column(String(120))
    alpha_two_code: Mapped[str | None] = mapped_column(String(4), index=True)
    state_province: Mapped[str | None] = mapped_column(String(200))
    domains: Mapped[list[str] | None] = mapped_column(JSONB)
    web_pages: Mapped[list[str] | None] = mapped_column(JSONB)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
