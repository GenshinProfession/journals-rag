"""Admin API for 3-layer school template management.

Layer 1: Schools (system-preset, read-only for admins except enable/disable)
Layer 2: Template Groups (degree × discipline × year)
Layer 3: Template Content (structure DSL, format rules DSL, citation rules)
"""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.deps import AdminUserDep, DbSessionDep
from app.models.user import User
from app.models.school import (
    School,
    SchoolTemplateGroup,
    TemplateCitationRules,
    TemplateFormatRules,
    TemplateStructure,
)
from app.models.university import UniversityDirectory
from app.schemas.schools import (
    CitationRulesPayload,
    CitationRulesResponse,
    FormatRulesPayload,
    FormatRulesResponse,
    SchoolCreate,
    SchoolResponse,
    SchoolUpdate,
    StructurePayload,
    StructureResponse,
    TemplateGroupCreate,
    TemplateGroupDetail,
    TemplateGroupResponse,
    TemplateGroupUpdate,
)
from app.schemas.universities import UniversityResponse

router = APIRouter()


def _can_manage_school(db, admin: User, school_id: UUID) -> bool:
    """Check if admin can manage the given school.

    super_admin: can manage everything.
    org_admin: can only manage schools they own (owner_id == admin.id).
    """
    if admin.role in ("super_admin", "admin"):
        return True
    school = db.get(School, school_id)
    return school is not None and school.owner_id == admin.id


# ── University directory search (for school creation) ────────────────────────

@router.get("/university-search", response_model=list[UniversityResponse])
def search_university_directory(
    _admin: AdminUserDep,
    db: DbSessionDep,
    q: str = Query(min_length=1, description="Name search"),
    limit: int = Query(default=20, ge=1, le=50),
) -> list[UniversityDirectory]:
    """Search the global university directory (for creating schools from it)."""
    stmt = (
        select(UniversityDirectory)
        .where(UniversityDirectory.name.ilike(f"%{q}%"))
        .order_by(UniversityDirectory.name)
        .limit(limit)
    )
    return list(db.scalars(stmt).all())


# ── Layer 1: Schools ─────────────────────────────────────────────────────────

@router.post("/schools", response_model=SchoolResponse, status_code=201)
def create_school(_admin: AdminUserDep, db: DbSessionDep, payload: SchoolCreate) -> School:
    """Create a school, optionally linked to a UniversityDirectory entry.

    org_admin: school.owner_id = caller.id (isolated to their org).
    super_admin: owner_id = NULL (shared pool).
    """
    existing = db.scalar(select(School.id).where(School.name == payload.name))
    if existing is not None:
        raise HTTPException(status_code=409, detail="School with this name already exists")
    country = payload.country
    if payload.university_id is not None:
        uni = db.get(UniversityDirectory, payload.university_id)
        if uni is None:
            raise HTTPException(status_code=404, detail="University not found in directory")
        if not country:
            country = uni.country or uni.alpha_two_code
    owner_id = _admin.id if _admin.role == "org_admin" else None
    school = School(
        name=payload.name, university_id=payload.university_id,
        country=country, owner_id=owner_id,
    )
    db.add(school)
    db.commit()
    db.refresh(school)
    return school

@router.delete("/schools/{school_id}", status_code=204)
def delete_school(_admin: AdminUserDep, db: DbSessionDep, school_id: UUID) -> None:
    """Delete a school and all its template groups."""
    school = db.get(School, school_id)
    if school is None:
        raise HTTPException(status_code=404, detail="School not found")
    if not _can_manage_school(db, _admin, school_id):
        raise HTTPException(status_code=403, detail="No permission to manage this school")
    db.delete(school)
    db.commit()

@router.get("/schools", response_model=list[SchoolResponse])
def list_schools(_admin: AdminUserDep, db: DbSessionDep, q: str | None = None) -> list[School]:
    """super_admin sees all; org_admin sees only own schools."""
    stmt = select(School).order_by(School.is_pinned.desc(), School.pinned_at.desc().nullslast(), School.name)
    if q:
        stmt = stmt.where(School.name.ilike(f"%{q}%"))
    if _admin.role == "org_admin":
        stmt = stmt.where(School.owner_id == _admin.id)
    return list(db.scalars(stmt).all())


@router.patch("/schools/{school_id}", response_model=SchoolResponse)
def update_school(_admin: AdminUserDep, db: DbSessionDep, school_id: UUID, payload: SchoolUpdate) -> School:
    school = db.get(School, school_id)
    if school is None:
        raise HTTPException(status_code=404, detail="School not found")
    if not _can_manage_school(db, _admin, school_id):
        raise HTTPException(status_code=403, detail="No permission to manage this school")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(school, k, v)
    db.commit()
    db.refresh(school)
    return school


@router.post("/schools/{school_id}/pin")
def toggle_pin(_admin: AdminUserDep, db: DbSessionDep, school_id: UUID) -> dict:
    """Toggle the pinned state of a school for quick access."""
    school = db.get(School, school_id)
    if school is None:
        raise HTTPException(status_code=404, detail="School not found")
    school.is_pinned = not school.is_pinned
    school.pinned_at = datetime.now(timezone.utc) if school.is_pinned else None
    db.commit()
    db.refresh(school)
    return {"id": str(school.id), "name": school.name, "is_pinned": school.is_pinned}


# ── Layer 2: Template Groups ─────────────────────────────────────────────────

def _enrich_group(group: SchoolTemplateGroup) -> TemplateGroupResponse:
    return TemplateGroupResponse(
        id=group.id,
        school_id=group.school_id,
        degree_level=group.degree_level,
        discipline=group.discipline,
        year=group.year,
        citation_style=group.citation_style,
        enabled=group.enabled,
        has_structure=group.structure is not None,
        has_format_rules=group.format_rules is not None,
        has_citation_rules=group.citation_rules is not None,
    )


@router.get("/schools/{school_id}/groups", response_model=list[TemplateGroupResponse])
def list_template_groups(_admin: AdminUserDep, db: DbSessionDep, school_id: UUID) -> list[TemplateGroupResponse]:
    school = db.get(School, school_id)
    if school is None:
        raise HTTPException(status_code=404, detail="School not found")
    stmt = (
        select(SchoolTemplateGroup)
        .where(SchoolTemplateGroup.school_id == school_id)
        .order_by(SchoolTemplateGroup.degree_level, SchoolTemplateGroup.discipline, SchoolTemplateGroup.year)
    )
    groups = list(db.scalars(stmt).all())
    return [_enrich_group(g) for g in groups]


@router.get("/groups/{group_id}", response_model=TemplateGroupDetail)
def get_template_group(_admin: AdminUserDep, db: DbSessionDep, group_id: UUID) -> TemplateGroupDetail:
    group = db.get(SchoolTemplateGroup, group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Template group not found")
    school = db.get(School, group.school_id)
    enriched = _enrich_group(group)
    return TemplateGroupDetail(
        **enriched.model_dump(),
        school_name=school.name if school else "",
    )


@router.post("/groups", response_model=TemplateGroupResponse, status_code=201)
def create_template_group(_admin: AdminUserDep, db: DbSessionDep, payload: TemplateGroupCreate) -> TemplateGroupResponse:
    school = db.get(School, payload.school_id)
    if school is None:
        raise HTTPException(status_code=404, detail="School not found")
    if not _can_manage_school(db, _admin, payload.school_id):
        raise HTTPException(status_code=403, detail="No permission to manage this school")
    group = SchoolTemplateGroup(**payload.model_dump())
    db.add(group)
    try:
        db.commit()
    except IntegrityError as err:
        db.rollback()
        raise HTTPException(status_code=409, detail="Template group with same dimensions already exists") from err
    db.refresh(group)
    return _enrich_group(group)


@router.patch("/groups/{group_id}", response_model=TemplateGroupResponse)
def update_template_group(
    _admin: AdminUserDep, db: DbSessionDep, group_id: UUID, payload: TemplateGroupUpdate
) -> TemplateGroupResponse:
    group = db.get(SchoolTemplateGroup, group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Template group not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(group, k, v)
    try:
        db.commit()
    except IntegrityError as err:
        db.rollback()
        raise HTTPException(status_code=409, detail="Dimension conflict") from err
    db.refresh(group)
    return _enrich_group(group)


@router.delete("/groups/{group_id}", status_code=204)
def delete_template_group(_admin: AdminUserDep, db: DbSessionDep, group_id: UUID) -> None:
    group = db.get(SchoolTemplateGroup, group_id)
    if group is None:
        return
    db.delete(group)
    db.commit()


# ── Layer 3: Template Content ────────────────────────────────────────────────

# -- Structure --
@router.get("/groups/{group_id}/structure", response_model=StructureResponse | None)
def get_structure(_admin: AdminUserDep, db: DbSessionDep, group_id: UUID) -> TemplateStructure | None:
    group = db.get(SchoolTemplateGroup, group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Template group not found")
    return group.structure


@router.put("/groups/{group_id}/structure", response_model=StructureResponse)
def upsert_structure(
    _admin: AdminUserDep, db: DbSessionDep, group_id: UUID, payload: StructurePayload
) -> TemplateStructure:
    group = db.get(SchoolTemplateGroup, group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Template group not found")
    if group.structure is None:
        item = TemplateStructure(group_id=group_id, structure_json=payload.structure_json)
        db.add(item)
    else:
        group.structure.structure_json = payload.structure_json
    db.commit()
    db.refresh(group)
    return group.structure  # type: ignore[return-value]


# -- Format Rules --
@router.get("/groups/{group_id}/format-rules", response_model=FormatRulesResponse | None)
def get_format_rules(_admin: AdminUserDep, db: DbSessionDep, group_id: UUID) -> TemplateFormatRules | None:
    group = db.get(SchoolTemplateGroup, group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Template group not found")
    return group.format_rules


@router.put("/groups/{group_id}/format-rules", response_model=FormatRulesResponse)
def upsert_format_rules(
    _admin: AdminUserDep, db: DbSessionDep, group_id: UUID, payload: FormatRulesPayload
) -> TemplateFormatRules:
    group = db.get(SchoolTemplateGroup, group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Template group not found")
    if group.format_rules is None:
        item = TemplateFormatRules(group_id=group_id, rules_json=payload.rules_json)
        db.add(item)
    else:
        group.format_rules.rules_json = payload.rules_json
    db.commit()
    db.refresh(group)
    return group.format_rules  # type: ignore[return-value]


# -- Citation Rules --
@router.get("/groups/{group_id}/citation-rules", response_model=CitationRulesResponse | None)
def get_citation_rules(_admin: AdminUserDep, db: DbSessionDep, group_id: UUID) -> TemplateCitationRules | None:
    group = db.get(SchoolTemplateGroup, group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Template group not found")
    return group.citation_rules


@router.put("/groups/{group_id}/citation-rules", response_model=CitationRulesResponse)
def upsert_citation_rules(
    _admin: AdminUserDep, db: DbSessionDep, group_id: UUID, payload: CitationRulesPayload
) -> TemplateCitationRules:
    group = db.get(SchoolTemplateGroup, group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Template group not found")
    if group.citation_rules is None:
        item = TemplateCitationRules(
            group_id=group_id, citation_json=payload.citation_json, citation_text=payload.citation_text
        )
        db.add(item)
    else:
        if payload.citation_json is not None:
            group.citation_rules.citation_json = payload.citation_json
        if payload.citation_text is not None:
            group.citation_rules.citation_text = payload.citation_text
    db.commit()
    db.refresh(group)
    return group.citation_rules  # type: ignore[return-value]
