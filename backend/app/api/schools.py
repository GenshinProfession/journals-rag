"""Writer-facing endpoints for browsing schools & template options."""

from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select

from app.deps import DbSessionDep, WriterUserDep
from app.models.school import School, SchoolTemplateGroup
from app.schemas.schools import SchoolResponse, WriterTemplateOption

router = APIRouter()


@router.get("/schools", response_model=list[SchoolResponse])
def list_schools(_writer: WriterUserDep, db: DbSessionDep, q: str | None = None) -> list[School]:
    stmt = select(School).where(School.enabled.is_(True)).order_by(School.name)
    if q:
        stmt = stmt.where(School.name.ilike(f"%{q}%"))
    return list(db.scalars(stmt).all())


@router.get("/schools/{school_id}/templates", response_model=list[WriterTemplateOption])
def list_school_templates(
    _writer: WriterUserDep, db: DbSessionDep, school_id: UUID
) -> list[WriterTemplateOption]:
    """Return all enabled template groups for a given school, with completeness flag."""
    school = db.get(School, school_id)
    if school is None:
        return []
    stmt = (
        select(SchoolTemplateGroup)
        .where(SchoolTemplateGroup.school_id == school_id, SchoolTemplateGroup.enabled.is_(True))
        .order_by(SchoolTemplateGroup.degree_level, SchoolTemplateGroup.discipline, SchoolTemplateGroup.year)
    )
    groups = list(db.scalars(stmt).all())
    result: list[WriterTemplateOption] = []
    for g in groups:
        complete = g.structure is not None and g.format_rules is not None
        result.append(
            WriterTemplateOption(
                group_id=g.id,
                school_id=school_id,
                school_name=school.name,
                degree_level=g.degree_level,
                discipline=g.discipline,
                year=g.year,
                citation_style=g.citation_style,
                complete=complete,
            )
        )
    return result
