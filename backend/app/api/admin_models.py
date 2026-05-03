from uuid import UUID

from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.deps import AdminUserDep, DbSessionDep
from app.models.model_catalog import ModelCatalog
from app.schemas.models import ModelCatalogCreate, ModelCatalogResponse, ModelCatalogUpdate

router = APIRouter()


@router.get("", response_model=list[ModelCatalogResponse])
def list_models(_admin: AdminUserDep, db: DbSessionDep) -> list[ModelCatalog]:
    statement = select(ModelCatalog).order_by(ModelCatalog.sort_order, ModelCatalog.display_name)
    return list(db.scalars(statement).all())


@router.post("", response_model=ModelCatalogResponse, status_code=201)
def create_model(
    _admin: AdminUserDep, db: DbSessionDep, payload: ModelCatalogCreate
) -> ModelCatalog:
    data = payload.model_dump()
    model = ModelCatalog(**data)
    db.add(model)
    try:
        db.commit()
    except IntegrityError as err:
        db.rollback()
        raise HTTPException(status_code=409, detail="Model insert failed") from err
    db.refresh(model)
    return model


@router.put("/{model_id}", response_model=ModelCatalogResponse)
def update_model(
    _admin: AdminUserDep, db: DbSessionDep, model_id: UUID, payload: ModelCatalogUpdate
) -> ModelCatalog:
    model = db.get(ModelCatalog, model_id)
    if model is None:
        raise HTTPException(status_code=404, detail="Model not found")
    updates = payload.model_dump(exclude_unset=True)
    for key, val in updates.items():
        setattr(model, key, val)
    db.add(model)
    db.commit()
    db.refresh(model)
    return model


@router.delete("/{model_id}", status_code=204)
def delete_model(_admin: AdminUserDep, db: DbSessionDep, model_id: UUID) -> None:
    model = db.get(ModelCatalog, model_id)
    if model is None:
        return
    db.delete(model)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="Cannot delete model referenced by projects or usage history"
        )
