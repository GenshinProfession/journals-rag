from uuid import UUID

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.deps import AdminUserDep, DbSessionDep
from app.models.billing import AccountWallet
from app.models.user import User
from app.schemas.users import UserResponse, UserUpdate, WriterCreate
from app.security import hash_password

router = APIRouter()


@router.get("", response_model=list[UserResponse])
def list_users(_admin: AdminUserDep, db: DbSessionDep) -> list[User]:
    rows = db.scalars(select(User).order_by(User.created_at.desc())).all()
    return list(rows)


@router.post("", response_model=UserResponse, status_code=201)
def create_writer(_admin: AdminUserDep, db: DbSessionDep, payload: WriterCreate) -> User:
    dup = db.scalar(select(User.id).where(User.username == payload.username))
    if dup is not None:
        raise HTTPException(status_code=409, detail="Username already registered")
    user = User(
        username=payload.username,
        password_hash=hash_password(payload.password),
        role="writer",
        is_active=payload.is_active,
        created_by=_admin.id,
    )
    db.add(user)
    db.flush()
    db.add(AccountWallet(user_id=user.id))
    db.commit()
    db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserResponse)
def update_user(_admin: AdminUserDep, db: DbSessionDep, user_id: UUID, payload: UserUpdate) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role == "admin" and payload.is_active is False:
        raise HTTPException(status_code=400, detail="Admin accounts cannot be disabled here")

    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.password is not None:
        user.password_hash = hash_password(payload.password)

    db.add(user)
    db.commit()
    db.refresh(user)
    return user
