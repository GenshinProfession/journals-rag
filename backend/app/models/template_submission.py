from uuid import UUID

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class TemplateSubmission(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "template_submissions"

    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"), index=True)
    school_name: Mapped[str] = mapped_column(String(255))
    degree_level: Mapped[str] = mapped_column(String(30))
    discipline: Mapped[str | None] = mapped_column(String(80))
    file_path: Mapped[str] = mapped_column(Text)
    file_name: Mapped[str] = mapped_column(String(255))
    citation_style: Mapped[str | None] = mapped_column(String(80))
    notes: Mapped[str | None] = mapped_column(Text)

    # AI pre-parsed DSL results
    parsed_structure: Mapped[dict | None] = mapped_column(JSONB)
    parsed_format_rules: Mapped[dict | None] = mapped_column(JSONB)
    parsed_citation_rules: Mapped[dict | None] = mapped_column(JSONB)
    parsed_citation_text: Mapped[str | None] = mapped_column(Text)

    # Review status
    status: Mapped[str] = mapped_column(String(30), default="pending")
    reviewer_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    review_notes: Mapped[str | None] = mapped_column(Text)
    token_reward: Mapped[int | None] = mapped_column(Integer)
    school_template_group_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("school_template_groups.id", ondelete="SET NULL")
    )
