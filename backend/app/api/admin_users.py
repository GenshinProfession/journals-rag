import secrets
from uuid import UUID

from fastapi import APIRouter, HTTPException
from sqlalchemy import delete, select

from app.deps import AdminUserDep, DbSessionDep
from app.models.billing import AccountWallet
from app.models.user import AdminSchoolAssignment, User
from app.schemas.users import (
    AdminCreate,
    AdminSchoolAssignRequest,
    UserResponse,
    UserUpdate,
    WriterCreate,
)
from app.security import hash_password

router = APIRouter()


def _user_response(db, user: User) -> dict:
    """Build UserResponse-compatible dict with assigned_school_ids."""
    school_ids: list[UUID] = []
    if user.role == "admin":
        stmt = select(AdminSchoolAssignment.school_id).where(
            AdminSchoolAssignment.admin_id == user.id
        )
        school_ids = list(db.scalars(stmt).all())
    return {
        "id": user.id,
        "username": user.username,
        "nickname": user.nickname,
        "role": user.role,
        "is_active": user.is_active,
        "manage_all_schools": user.manage_all_schools,
        "assigned_school_ids": school_ids,
    }


@router.get("")
def list_users(_admin: AdminUserDep, db: DbSessionDep) -> list[dict]:
    rows = list(db.scalars(select(User).order_by(User.created_at.desc())).all())
    return [_user_response(db, u) for u in rows]


@router.post("")
def create_writer(_admin: AdminUserDep, db: DbSessionDep, payload: WriterCreate) -> dict:
    dup = db.scalar(select(User.id).where(User.username == payload.username))
    if dup is not None:
        raise HTTPException(status_code=409, detail="Username already registered")
    raw_key = secrets.token_hex(16)
    user = User(
        username=payload.username,
        nickname=payload.nickname,
        password_hash=hash_password(raw_key),
        role="writer",
        is_active=True,
        created_by=_admin.id,
    )
    db.add(user)
    db.flush()
    db.add(AccountWallet(user_id=user.id))
    db.commit()
    db.refresh(user)
    return {
        "id": str(user.id),
        "username": user.username,
        "nickname": user.nickname,
        "role": user.role,
        "is_active": user.is_active,
        "secret_key": raw_key,
    }


@router.post("/{user_id}/regenerate-key")
def regenerate_writer_key(_admin: AdminUserDep, db: DbSessionDep, user_id: UUID) -> dict:
    """Generate a new secret key for a writer. Returns the key once; it is never stored in plain text."""
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role != "writer":
        raise HTTPException(status_code=400, detail="Only writer accounts use secret keys")
    raw_key = secrets.token_hex(16)
    user.password_hash = hash_password(raw_key)
    db.commit()
    return {
        "id": str(user.id),
        "username": user.username,
        "secret_key": raw_key,
    }


@router.post("/admin", status_code=201)
def create_admin(_admin: AdminUserDep, db: DbSessionDep, payload: AdminCreate) -> dict:
    dup = db.scalar(select(User.id).where(User.username == payload.username))
    if dup is not None:
        raise HTTPException(status_code=409, detail="Username already registered")
    user = User(
        username=payload.username,
        nickname=payload.nickname,
        password_hash=hash_password(payload.password),
        role="admin",
        is_active=True,
        created_by=_admin.id,
        manage_all_schools=payload.manage_all_schools,
    )
    db.add(user)
    db.flush()

    if not payload.manage_all_schools and payload.assigned_school_ids:
        for sid in payload.assigned_school_ids:
            db.add(AdminSchoolAssignment(admin_id=user.id, school_id=sid))

    db.commit()
    db.refresh(user)
    return _user_response(db, user)


@router.patch("/{user_id}")
def update_user(_admin: AdminUserDep, db: DbSessionDep, user_id: UUID, payload: UserUpdate) -> dict:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role == "admin" and payload.is_active is False:
        raise HTTPException(status_code=400, detail="Admin accounts cannot be disabled here")

    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.password is not None:
        user.password_hash = hash_password(payload.password)
    if payload.nickname is not None:
        user.nickname = payload.nickname
    if payload.manage_all_schools is not None and user.role == "admin":
        user.manage_all_schools = payload.manage_all_schools

    db.add(user)
    db.commit()
    db.refresh(user)
    return _user_response(db, user)


@router.put("/{user_id}/schools")
def assign_schools(
    _admin: AdminUserDep, db: DbSessionDep, user_id: UUID, payload: AdminSchoolAssignRequest
) -> dict:
    """Replace the school assignments for a sub-admin."""
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role != "admin":
        raise HTTPException(status_code=400, detail="School assignments only apply to admin accounts")

    db.execute(delete(AdminSchoolAssignment).where(AdminSchoolAssignment.admin_id == user.id))
    for sid in payload.school_ids:
        db.add(AdminSchoolAssignment(admin_id=user.id, school_id=sid))
    db.commit()

    return _user_response(db, user)
