from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.model_catalog import ModelCatalog


class ModelService:
    def __init__(self, db: Session):
        self.db = db

    def list_enabled_for_scenario(self, scenario: str) -> list[ModelCatalog]:
        statement = select(ModelCatalog).where(ModelCatalog.enabled.is_(True))
        models = list(self.db.scalars(statement))
        return [model for model in models if scenario in (model.allowed_scenarios or [])]
