"""Admin API for 3-layer school template management.

Layer 1: Schools (system-preset, read-only for admins except enable/disable)
Layer 2: Template Groups (degree × discipline × year)
Layer 3: Template Content (structure DSL, format rules DSL, citation rules)
"""

from uuid import UUID

from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.deps import AdminUserDep, DbSessionDep
from app.models.school import (
    School,
    SchoolTemplateGroup,
    TemplateCitationRules,
    TemplateFormatRules,
    TemplateStructure,
)
from app.schemas.schools import (
    CitationRulesPayload,
    CitationRulesResponse,
    FormatRulesPayload,
    FormatRulesResponse,
    SchoolResponse,
    SchoolUpdate,
    StructurePayload,
    StructureResponse,
    TemplateGroupCreate,
    TemplateGroupResponse,
    TemplateGroupUpdate,
)

router = APIRouter()

# ── Preset university list (for bootstrapping) ──────────────────────────────

CHINA_UNIVERSITIES = [
    "北京大学", "清华大学", "中国人民大学", "北京航空航天大学", "北京理工大学",
    "中国农业大学", "北京师范大学", "中央民族大学", "北京邮电大学", "北京交通大学",
    "北京科技大学", "北京化工大学", "北京林业大学", "中国传媒大学", "中央财经大学",
    "对外经济贸易大学", "北京中医药大学", "北京外国语大学", "中国政法大学",
    "华北电力大学", "中国矿业大学(北京)", "中国石油大学(北京)", "中国地质大学(北京)",
    "复旦大学", "上海交通大学", "同济大学", "华东师范大学", "上海财经大学",
    "上海外国语大学", "东华大学", "华东理工大学", "上海大学",
    "南京大学", "东南大学", "南京航空航天大学", "南京理工大学", "河海大学",
    "南京农业大学", "中国药科大学", "南京师范大学", "苏州大学", "江南大学",
    "中国矿业大学",
    "浙江大学", "中国科学技术大学", "合肥工业大学", "安徽大学",
    "厦门大学", "福州大学",
    "山东大学", "中国海洋大学", "中国石油大学(华东)",
    "武汉大学", "华中科技大学", "中南财经政法大学", "华中师范大学",
    "华中农业大学", "中国地质大学(武汉)", "武汉理工大学",
    "中南大学", "湖南大学", "湖南师范大学", "国防科技大学",
    "中山大学", "华南理工大学", "暨南大学", "华南师范大学",
    "四川大学", "电子科技大学", "西南交通大学", "西南财经大学",
    "重庆大学", "西南大学",
    "西安交通大学", "西北工业大学", "西安电子科技大学", "长安大学",
    "西北农林科技大学", "陕西师范大学",
    "兰州大学", "西北大学",
    "哈尔滨工业大学", "吉林大学", "东北大学", "大连理工大学",
    "东北师范大学", "哈尔滨工程大学", "延边大学",
    "天津大学", "南开大学",
    "郑州大学", "河南大学",
    "云南大学", "贵州大学", "广西大学", "海南大学",
    "新疆大学", "石河子大学", "西藏大学", "内蒙古大学", "宁夏大学", "青海大学",
    "太原理工大学", "南昌大学",
    "中央美术学院", "中国美术学院", "西安美术学院", "广州美术学院",
    "四川美术学院", "天津美术学院", "鲁迅美术学院", "湖北美术学院",
]


@router.post("/bootstrap-schools", status_code=200)
def bootstrap_schools(_admin: AdminUserDep, db: DbSessionDep) -> dict[str, int]:
    """Seed the schools table from the preset list. Idempotent."""
    created = 0
    for name in CHINA_UNIVERSITIES:
        exists = db.scalar(select(School.id).where(School.name == name))
        if exists is None:
            db.add(School(name=name, country="CN"))
            created += 1
    db.commit()
    return {"created": created, "total": len(CHINA_UNIVERSITIES)}


# ── Layer 1: Schools ─────────────────────────────────────────────────────────

@router.get("/schools", response_model=list[SchoolResponse])
def list_schools(_admin: AdminUserDep, db: DbSessionDep, q: str | None = None) -> list[School]:
    stmt = select(School).order_by(School.name)
    if q:
        stmt = stmt.where(School.name.ilike(f"%{q}%"))
    return list(db.scalars(stmt).all())


@router.patch("/schools/{school_id}", response_model=SchoolResponse)
def update_school(_admin: AdminUserDep, db: DbSessionDep, school_id: UUID, payload: SchoolUpdate) -> School:
    school = db.get(School, school_id)
    if school is None:
        raise HTTPException(status_code=404, detail="School not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(school, k, v)
    db.commit()
    db.refresh(school)
    return school


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


@router.post("/groups", response_model=TemplateGroupResponse, status_code=201)
def create_template_group(_admin: AdminUserDep, db: DbSessionDep, payload: TemplateGroupCreate) -> TemplateGroupResponse:
    school = db.get(School, payload.school_id)
    if school is None:
        raise HTTPException(status_code=404, detail="School not found")
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
