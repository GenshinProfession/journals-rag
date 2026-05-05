from uuid import UUID

from pydantic import BaseModel, Field


class WriterCreate(BaseModel):
    username: str = Field(min_length=2, max_length=100)
    nickname: str | None = None


class OrgAdminCreate(BaseModel):
    """Create a new org_admin (institution administrator).

    No password required — a one-time secret key is generated (same flow as writers).
    The password_hash in the DB can be manually set as a fallback.
    """
    username: str = Field(min_length=2, max_length=100)
    nickname: str | None = None
    manage_all_schools: bool = False
    assigned_school_ids: list[UUID] | None = Field(
        default=None,
        description="School IDs this org_admin can manage. Ignored when manage_all_schools is True.",
    )


class AdminCreate(OrgAdminCreate):
    """Legacy alias; super_admin uses this to create sub-admins."""
    pass


class UserUpdate(BaseModel):
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=6, max_length=128)
    nickname: str | None = None
    manage_all_schools: bool | None = None


class UserResponse(BaseModel):
    id: UUID
    username: str
    nickname: str | None = None
    role: str
    is_active: bool
    manage_all_schools: bool = False
    org_id: UUID | None = None
    assigned_school_ids: list[UUID] = []

    model_config = {"from_attributes": True}


class AdminSchoolAssignRequest(BaseModel):
    school_ids: list[UUID] = Field(description="School IDs to assign to this admin. Replaces all current assignments.")
