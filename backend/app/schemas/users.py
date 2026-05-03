from uuid import UUID

from pydantic import BaseModel, Field


class WriterCreate(BaseModel):
    username: str = Field(min_length=2, max_length=100)
    nickname: str | None = None


class AdminCreate(BaseModel):
    username: str = Field(min_length=2, max_length=100)
    password: str = Field(min_length=6, max_length=128)
    nickname: str | None = None


class UserUpdate(BaseModel):
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=6, max_length=128)
    nickname: str | None = None


class UserResponse(BaseModel):
    id: UUID
    username: str
    nickname: str | None = None
    role: str
    is_active: bool

    model_config = {"from_attributes": True}
