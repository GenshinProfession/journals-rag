"""Writer-facing endpoints for browsing schools & template options.

Isolation rules:
- Writer with org_id:
  - org_admin.manage_all_schools=True → sees ALL schools.
  - Otherwise → sees org_admin's own schools + org_admin's assigned schools.
- Writer without org_id (created by super_admin) → sees shared-pool schools (owner_id IS NULL).
"""

from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import or_, select

from app.deps import DbSessionDep, WriterUserDep
from app.models.school import School, SchoolTemplateGroup
from app.models.user import AdminSchoolAssignment, User
from app.schemas.schools import SchoolResponse, WriterTemplateOption

router = APIRouter()


def _visibility_filter(writer, db):
    """Return SQLAlchemy filter for the schools this writer is allowed to see."""
    if writer.org_id is None:
        # super_admin's writer: shared pool only
        return School.owner_id.is_(None)
    # Load org_admin to check manage_all_schools
    org_admin = db.get(User, writer.org_id)
    if org_admin and org_admin.manage_all_schools:
        return True  # no filter needed
    # org_admin's own schools + assigned schools
    assigned_ids = select(AdminSchoolAssignment.school_id).where(
        AdminSchoolAssignment.admin_id == writer.org_id
    ).scalar_subquery()
    return or_(School.owner_id == writer.org_id, School.id.in_(assigned_ids))


@router.get("/schools", response_model=list[SchoolResponse])
def list_schools(_writer: WriterUserDep, db: DbSessionDep, q: str | None = None) -> list[School]:
    vis = _visibility_filter(_writer, db)
    stmt = select(School).where(School.enabled.is_(True)).order_by(School.name)
    if vis is not True:
        stmt = stmt.where(vis)
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
    # Enforce ownership isolation
    vis = _visibility_filter(_writer, db)
    if vis is not True:
        # Check if this specific school passes the filter
        hit = db.scalar(
            select(School.id).where(School.id == school_id, vis)
        )
        if hit is None:
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
