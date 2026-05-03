from fastapi import APIRouter
from sqlalchemy import select

from app.deps import DbSessionDep, WriterUserDep
from app.models.model_catalog import ModelCatalog
from app.schemas.models import ModelCatalogResponse

router = APIRouter()


@router.get("", response_model=list[ModelCatalogResponse])
def available_models(
    writer: WriterUserDep, db: DbSessionDep, scenario: str | None = None
) -> list[ModelCatalog]:
    statement = (
        select(ModelCatalog)
        .where(ModelCatalog.enabled.is_(True))
        .order_by(ModelCatalog.sort_order, ModelCatalog.display_name)
    )
    models = list(db.scalars(statement).all())
    if scenario is None:
        return models
    return [
        m for m in models if not (m.allowed_scenarios or []) or scenario in (m.allowed_scenarios or [])
    ]
