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
]


@router.get("/university-list")
def university_list(_admin: AdminUserDep) -> list[str]:
    return CHINA_UNIVERSITIES


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
