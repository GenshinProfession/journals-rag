from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class School(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Top-level school entity. System-preset, not user-created."""

    __tablename__ = "schools"

    name: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    country: Mapped[str | None] = mapped_column(String(10))
    logo_url: Mapped[str | None] = mapped_column(String(500))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    pinned_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    template_groups: Mapped[list["SchoolTemplateGroup"]] = relationship(
        back_populates="school", cascade="all, delete-orphan"
    )


class SchoolTemplateGroup(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Second layer: locates a template by school + degree + discipline + year."""

    __tablename__ = "school_template_groups"
    __table_args__ = (
        UniqueConstraint("school_id", "degree_level", "discipline", "year", name="uq_template_group_dim"),
    )

    school_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("schools.id", ondelete="CASCADE"), index=True
    )
    degree_level: Mapped[str] = mapped_column(String(30))
    discipline: Mapped[str | None] = mapped_column(String(120))
    year: Mapped[int | None] = mapped_column(Integer)
    citation_style: Mapped[str | None] = mapped_column(String(80))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, index=True)

    school: Mapped["School"] = relationship(back_populates="template_groups")

    structure: Mapped["TemplateStructure | None"] = relationship(
        back_populates="group", uselist=False, cascade="all, delete-orphan"
    )
    format_rules: Mapped["TemplateFormatRules | None"] = relationship(
        back_populates="group", uselist=False, cascade="all, delete-orphan"
    )
    citation_rules: Mapped["TemplateCitationRules | None"] = relationship(
        back_populates="group", uselist=False, cascade="all, delete-orphan"
    )


class TemplateStructure(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Document structure DSL (sections order, cover template, etc.)."""

    __tablename__ = "template_structures"

    group_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("school_template_groups.id", ondelete="CASCADE"), unique=True
    )
    structure_json: Mapped[dict] = mapped_column(JSONB, default=dict)

    group: Mapped["SchoolTemplateGroup"] = relationship(back_populates="structure")


class TemplateFormatRules(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Typography / layout DSL (fonts, spacing, margins, etc.)."""

    __tablename__ = "template_format_rules"

    group_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("school_template_groups.id", ondelete="CASCADE"), unique=True
    )
    rules_json: Mapped[dict] = mapped_column(JSONB, default=dict)

    group: Mapped["SchoolTemplateGroup"] = relationship(back_populates="format_rules")


class TemplateCitationRules(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Citation format template (examples + rules text)."""

    __tablename__ = "template_citation_rules"

    group_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("school_template_groups.id", ondelete="CASCADE"), unique=True
    )
    citation_json: Mapped[dict | None] = mapped_column(JSONB)
    citation_text: Mapped[str | None] = mapped_column(Text)

    group: Mapped["SchoolTemplateGroup"] = relationship(back_populates="citation_rules")


# Keep backward compat alias so existing code referencing SchoolTemplate doesn't crash immediately.
# TODO: migrate projects.school_id FK from school_templates → school_template_groups
SchoolTemplate = SchoolTemplateGroup
