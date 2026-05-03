from uuid import UUID

from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.deps import AdminUserDep, DbSessionDep
from app.models.school import SchoolTemplate
from app.schemas.schools import (
    SchoolTemplateCreate,
    SchoolTemplateResponse,
    SchoolTemplateUpdate,
)

router = APIRouter()


@router.get("", response_model=list[SchoolTemplateResponse])
def list_school_templates(_admin: AdminUserDep, db: DbSessionDep) -> list[SchoolTemplate]:
    stmt = select(SchoolTemplate).order_by(SchoolTemplate.name)
    return list(db.scalars(stmt).all())


@router.post("", response_model=SchoolTemplateResponse, status_code=201)
def create_school_template(
    _admin: AdminUserDep, db: DbSessionDep, payload: SchoolTemplateCreate
) -> SchoolTemplate:
    item = SchoolTemplate(**payload.model_dump())
    db.add(item)
    try:
        db.commit()
    except IntegrityError as err:
        db.rollback()
        raise HTTPException(status_code=409, detail="School template already exists") from err
    db.refresh(item)
    return item


@router.put("/{template_id}", response_model=SchoolTemplateResponse)
def update_school_template(
    _admin: AdminUserDep,
    db: DbSessionDep,
    template_id: UUID,
    payload: SchoolTemplateUpdate,
) -> SchoolTemplate:
    item = db.get(SchoolTemplate, template_id)
    if item is None:
        raise HTTPException(status_code=404, detail="School template not found")
    for key, val in payload.model_dump(exclude_unset=True).items():
        setattr(item, key, val)
    db.add(item)
    try:
        db.commit()
    except IntegrityError as err:
        db.rollback()
        raise HTTPException(status_code=409, detail="School template update conflict") from err
    db.refresh(item)
    return item


@router.delete("/{template_id}", status_code=204)
def delete_school_template(_admin: AdminUserDep, db: DbSessionDep, template_id: UUID) -> None:
    item = db.get(SchoolTemplate, template_id)
    if item is None:
        return
    db.delete(item)
    try:
        db.commit()
    except IntegrityError as err:
        db.rollback()
        raise HTTPException(status_code=409, detail="School template is referenced by projects") from err
