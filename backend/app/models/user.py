from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"

    username: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    nickname: Mapped[str | None] = mapped_column(String(100), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="writer")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    manage_all_schools: Mapped[bool] = mapped_column(Boolean, default=False)


class AdminSchoolAssignment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Scoped permission: which schools a sub-admin can manage."""
    __tablename__ = "admin_school_assignments"
    __table_args__ = (
        UniqueConstraint("admin_id", "school_id", name="uq_admin_school"),
    )

    admin_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"), index=True)
    school_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("schools.id"), index=True)
