"""Admin API for the global university directory.

Supports full CRUD and a one-click seed endpoint that imports
data/world_universities_and_domains.json.
"""

import json
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select

from app.deps import AdminUserDep, DbSessionDep
from app.models.university import UniversityDirectory
from app.schemas.universities import (
    UniversityCreate,
    UniversityPage,
    UniversityResponse,
    UniversityUpdate,
)

router = APIRouter()

_DATA_FILE = Path(__file__).resolve().parents[3] / "data" / "world_universities_and_domains.json"


@router.post("/seed", status_code=200)
def seed_universities(_admin: AdminUserDep, db: DbSessionDep) -> dict:
    """Import world_universities_and_domains.json into the directory table.

    Skips rows whose name already exists (idempotent).
    """
    if not _DATA_FILE.exists():
        raise HTTPException(status_code=404, detail=f"Data file not found: {_DATA_FILE}")

    with open(_DATA_FILE, "r", encoding="utf-8") as f:
        raw: list[dict] = json.load(f)

    # Fetch existing names for fast de-dup
    existing_names: set[str] = set(db.scalars(select(UniversityDirectory.name)).all())

    created = 0
    batch: list[UniversityDirectory] = []
    for entry in raw:
        name = (entry.get("name") or "").strip()
        if not name or name in existing_names:
            continue
        existing_names.add(name)
        batch.append(
            UniversityDirectory(
                name=name,
                country=entry.get("country"),
                alpha_two_code=entry.get("alpha_two_code"),
                state_province=entry.get("state-province"),
                domains=entry.get("domains"),
                web_pages=entry.get("web_pages"),
            )
        )
        created += 1
        # Flush in batches to keep memory reasonable
        if len(batch) >= 500:
            db.add_all(batch)
            db.flush()
            batch.clear()

    if batch:
        db.add_all(batch)

    db.commit()
    total = db.scalar(select(func.count(UniversityDirectory.id))) or 0
    return {"created": created, "total": total}


@router.get("", response_model=UniversityPage)
def list_universities(
    _admin: AdminUserDep,
    db: DbSessionDep,
    q: str | None = Query(default=None, description="Search by name (fuzzy)"),
    country: str | None = Query(default=None, description="Filter by alpha_two_code"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> UniversityPage:
    base = select(UniversityDirectory)
    count_base = select(func.count(UniversityDirectory.id))

    if q:
        base = base.where(UniversityDirectory.name.ilike(f"%{q}%"))
        count_base = count_base.where(UniversityDirectory.name.ilike(f"%{q}%"))
    if country:
        base = base.where(UniversityDirectory.alpha_two_code == country.upper())
        count_base = count_base.where(UniversityDirectory.alpha_two_code == country.upper())

    total = db.scalar(count_base) or 0
    stmt = base.order_by(UniversityDirectory.alpha_two_code, UniversityDirectory.name)
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    items = list(db.scalars(stmt).all())
    return UniversityPage(items=items, total=total, page=page, page_size=page_size)


@router.post("", response_model=UniversityResponse, status_code=201)
def create_university(_admin: AdminUserDep, db: DbSessionDep, payload: UniversityCreate) -> UniversityDirectory:
    uni = UniversityDirectory(**payload.model_dump())
    db.add(uni)
    db.commit()
    db.refresh(uni)
    return uni


@router.patch("/{university_id}", response_model=UniversityResponse)
def update_university(
    _admin: AdminUserDep,
    db: DbSessionDep,
    university_id: UUID,
    payload: UniversityUpdate,
) -> UniversityDirectory:
    uni = db.get(UniversityDirectory, university_id)
    if uni is None:
        raise HTTPException(status_code=404, detail="University not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(uni, k, v)
    db.commit()
    db.refresh(uni)
    return uni


@router.delete("/{university_id}", status_code=204)
def delete_university(_admin: AdminUserDep, db: DbSessionDep, university_id: UUID) -> None:
    uni = db.get(UniversityDirectory, university_id)
    if uni is None:
        raise HTTPException(status_code=404, detail="University not found")
    db.delete(uni)
    db.commit()
