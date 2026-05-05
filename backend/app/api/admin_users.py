import secrets
from uuid import UUID

from fastapi import APIRouter, HTTPException
from sqlalchemy import delete, select

from app.deps import AdminUserDep, DbSessionDep, SuperAdminDep
from app.models.billing import AccountWallet
from app.models.user import AdminSchoolAssignment, User
from app.schemas.users import (
    AdminCreate,
    AdminSchoolAssignRequest,
    OrgAdminCreate,
    UserResponse,
    UserUpdate,
    WriterCreate,
)
from app.security import hash_password

router = APIRouter()

_ADMIN_ROLES = ("super_admin", "org_admin", "admin")


def _user_response(db, user: User) -> dict:
    """Build UserResponse-compatible dict with assigned_school_ids."""
    school_ids: list[UUID] = []
    if user.role in _ADMIN_ROLES:
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
        "org_id": user.org_id,
        "assigned_school_ids": school_ids,
    }


@router.get("")
def list_users(caller: AdminUserDep, db: DbSessionDep) -> list[dict]:
    """super_admin sees everyone; org_admin sees only own writers."""
    if caller.role in ("super_admin", "admin"):
        rows = list(db.scalars(select(User).order_by(User.created_at.desc())).all())
    else:
        rows = list(db.scalars(
            select(User).where(
                (User.id == caller.id) | (User.org_id == caller.id)
            ).order_by(User.created_at.desc())
        ).all())
    return [_user_response(db, u) for u in rows]


@router.post("")
def create_writer(caller: AdminUserDep, db: DbSessionDep, payload: WriterCreate) -> dict:
    """Both super_admin and org_admin can create writers.
    org_admin's writers are automatically linked via org_id."""
    dup = db.scalar(select(User.id).where(User.username == payload.username))
    if dup is not None:
        raise HTTPException(status_code=409, detail="Username already registered")
    raw_key = secrets.token_hex(16)

    # Determine org_id: if caller is org_admin, writer belongs to them
    org_id: UUID | None = None
    if caller.role == "org_admin":
        org_id = caller.id
    elif caller.role in ("super_admin", "admin"):
        org_id = None  # super_admin creates unattached writers (or can be assigned later)

    user = User(
        username=payload.username,
        nickname=payload.nickname,
        password_hash=hash_password(raw_key),
        role="writer",
        is_active=True,
        created_by=caller.id,
        org_id=org_id,
    )
    db.add(user)
    db.flush()
    # No wallet for writers — they use their org_admin's wallet
    db.commit()
    db.refresh(user)
    return {
        "id": str(user.id),
        "username": user.username,
        "nickname": user.nickname,
        "role": user.role,
        "is_active": user.is_active,
        "org_id": str(org_id) if org_id else None,
        "secret_key": raw_key,
    }


@router.post("/{user_id}/regenerate-key")
def regenerate_writer_key(caller: AdminUserDep, db: DbSessionDep, user_id: UUID) -> dict:
    """Generate a new secret key for a writer. Returns the key once; it is never stored in plain text."""
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role != "writer":
        raise HTTPException(status_code=400, detail="Only writer accounts use secret keys")
    # org_admin can only regenerate keys for their own writers
    if caller.role == "org_admin" and user.org_id != caller.id:
        raise HTTPException(status_code=403, detail="Cannot manage writers outside your organization")
    raw_key = secrets.token_hex(16)
    user.password_hash = hash_password(raw_key)
    db.commit()
    return {
        "id": str(user.id),
        "username": user.username,
        "secret_key": raw_key,
    }


@router.post("/org-admin", status_code=201)
def create_org_admin(caller: SuperAdminDep, db: DbSessionDep, payload: OrgAdminCreate) -> dict:
    """Create a new org_admin (institution administrator). Super-admin only."""
    dup = db.scalar(select(User.id).where(User.username == payload.username))
    if dup is not None:
        raise HTTPException(status_code=409, detail="Username already registered")
    user = User(
        username=payload.username,
        nickname=payload.nickname,
        password_hash=hash_password(payload.password),
        role="org_admin",
        is_active=True,
        created_by=caller.id,
        manage_all_schools=payload.manage_all_schools,
    )
    db.add(user)
    db.flush()

    # Create wallet for org_admin
    db.add(AccountWallet(user_id=user.id))

    if not payload.manage_all_schools and payload.assigned_school_ids:
        for sid in payload.assigned_school_ids:
            db.add(AdminSchoolAssignment(admin_id=user.id, school_id=sid))

    db.commit()
    db.refresh(user)
    return _user_response(db, user)


@router.post("/admin", status_code=201)
def create_admin(caller: SuperAdminDep, db: DbSessionDep, payload: AdminCreate) -> dict:
    """Legacy endpoint — creates org_admin for backward compatibility."""
    return create_org_admin(caller, db, payload)


@router.patch("/{user_id}")
def update_user(caller: AdminUserDep, db: DbSessionDep, user_id: UUID, payload: UserUpdate) -> dict:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    # org_admin can only update their own writers
    if caller.role == "org_admin":
        if user.role == "writer" and user.org_id != caller.id:
            raise HTTPException(status_code=403, detail="Cannot manage writers outside your organization")
        if user.role != "writer" and user.id != caller.id:
            raise HTTPException(status_code=403, detail="Cannot modify other administrators")

    if user.role in _ADMIN_ROLES and payload.is_active is False:
        if caller.role not in ("super_admin", "admin"):
            raise HTTPException(status_code=403, detail="Only super_admin can disable admin accounts")

    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.password is not None:
        user.password_hash = hash_password(payload.password)
    if payload.nickname is not None:
        user.nickname = payload.nickname
    if payload.manage_all_schools is not None and user.role in _ADMIN_ROLES:
        if caller.role not in ("super_admin", "admin"):
            raise HTTPException(status_code=403, detail="Only super_admin can change school permissions")
        user.manage_all_schools = payload.manage_all_schools

    db.add(user)
    db.commit()
    db.refresh(user)
    return _user_response(db, user)


@router.put("/{user_id}/schools")
def assign_schools(
    caller: SuperAdminDep, db: DbSessionDep, user_id: UUID, payload: AdminSchoolAssignRequest
) -> dict:
    """Replace the school assignments for an org_admin. Super-admin only."""
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role not in _ADMIN_ROLES:
        raise HTTPException(status_code=400, detail="School assignments only apply to admin accounts")

    db.execute(delete(AdminSchoolAssignment).where(AdminSchoolAssignment.admin_id == user.id))
    for sid in payload.school_ids:
        db.add(AdminSchoolAssignment(admin_id=user.id, school_id=sid))
    db.commit()

    return _user_response(db, user)
