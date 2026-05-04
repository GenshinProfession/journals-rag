from uuid import UUID

from pydantic import BaseModel, Field


class WriterCreate(BaseModel):
    username: str = Field(min_length=2, max_length=100)
    nickname: str | None = None


class AdminCreate(BaseModel):
    username: str = Field(min_length=2, max_length=100)
    password: str = Field(min_length=6, max_length=128)
    nickname: str | None = None
    manage_all_schools: bool = False
    assigned_school_ids: list[UUID] | None = Field(
        default=None,
        description="School IDs this admin can manage. Ignored when manage_all_schools is True.",
    )


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
    assigned_school_ids: list[UUID] = []

    model_config = {"from_attributes": True}


class AdminSchoolAssignRequest(BaseModel):
    school_ids: list[UUID] = Field(description="School IDs to assign to this admin. Replaces all current assignments.")
