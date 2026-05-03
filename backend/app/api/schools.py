from fastapi import APIRouter
from sqlalchemy import select

from app.deps import DbSessionDep, WriterUserDep
from app.models.school import SchoolTemplate
from app.schemas.schools import SchoolTemplateResponse

router = APIRouter()


@router.get("", response_model=list[SchoolTemplateResponse])
def list_available_school_templates(
    _writer: WriterUserDep,
    db: DbSessionDep,
    degree_level: str | None = None,
    discipline: str | None = None,
) -> list[SchoolTemplate]:
    stmt = select(SchoolTemplate).where(SchoolTemplate.enabled.is_(True)).order_by(SchoolTemplate.name)
    rows = list(db.scalars(stmt).all())
    if degree_level:
        rows = [r for r in rows if r.degree_level in (None, degree_level)]
    if discipline:
        rows = [r for r in rows if r.discipline in (None, discipline)]
    return rows
