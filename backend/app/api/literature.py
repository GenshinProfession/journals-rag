import json
from pathlib import Path
import re
from uuid import UUID

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from sqlalchemy import func, select

from app.deps import DbSessionDep, LLMServiceDep, SettingsDep, WriterUserDep
from app.models.model_catalog import ModelCatalog
from app.models.project import Project
from app.models.rag import Literature
from app.schemas.literature import LiteratureCreate, LiteratureRelevanceRequest, LiteratureSearchRequest
from app.services.literature_text import resolve_literature_text

router = APIRouter()

MIN_LITERATURE_FOR_WRITING = 10


def _require_project(db, writer, project_id: UUID) -> Project:
    project = db.get(Project, project_id)
    if project is None or project.user_id != writer.id:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _safe_filename(name: str) -> str:
    stem = Path(name).name.replace(" ", "_")
    cleaned = re.sub(r"[^A-Za-z0-9_.-]", "", stem)
    return cleaned[:200] if cleaned else "upload.bin"


def _lit_count(db, project_id: UUID) -> int:
    return db.scalar(select(func.count(Literature.id)).where(Literature.project_id == project_id)) or 0


@router.get("")
def list_literature(
    writer: WriterUserDep,
    db: DbSessionDep,
    project_id: UUID,
) -> dict[str, object]:
    project = _require_project(db, writer, project_id)
    stmt = select(Literature).where(Literature.project_id == project_id).order_by(Literature.created_at.desc())
    items = list(db.scalars(stmt).all())
    total = len(items)
    ready = total >= MIN_LITERATURE_FOR_WRITING
    return {
        "project_id": str(project_id),
        "total": total,
        "min_required": MIN_LITERATURE_FOR_WRITING,
        "can_start_writing": ready,
        "items": [
            {
                "id": str(lit.id),
                "title": lit.title,
                "authors": lit.authors,
                "year": lit.year,
                "journal": lit.journal,
                "doi": lit.doi,
                "abstract": (lit.abstract or "")[:300],
                "rag_status": lit.rag_status,
                "source": lit.source,
                "folder": lit.folder,
                "is_cited": lit.is_cited,
            }
            for lit in items
        ],
    }


@router.post("")
def create_literature(
    writer: WriterUserDep,
    db: DbSessionDep,
    project_id: UUID,
    payload: LiteratureCreate,
) -> dict[str, object]:
    _require_project(db, writer, project_id)
    lit = Literature(
        project_id=project_id,
        title=payload.title,
        authors=payload.authors,
        year=payload.year,
        journal=payload.journal,
        doi=payload.doi,
        abstract=payload.abstract or payload.body_text,
        citation_key=payload.citation_key,
        folder=payload.folder,
        source="manual",
        rag_status="pending",
    )
    db.add(lit)
    db.commit()
    db.refresh(lit)
    return {"id": str(lit.id), "title": lit.title, "rag_status": lit.rag_status}


@router.post("/upload")
async def upload_literature(
    writer: WriterUserDep,
    db: DbSessionDep,
    settings: SettingsDep,
    project_id: UUID,
    title: str = Form(""),
    files: list[UploadFile] = File(...),
) -> dict[str, object]:
    _require_project(db, writer, project_id)
    results: list[dict[str, str]] = []
    errors: list[str] = []

    for file in files:
        if not file.filename:
            errors.append("missing_filename")
            continue
        suffix = Path(file.filename).suffix.lower()
        if suffix not in settings.upload_allowed_extensions:
            errors.append(f"{file.filename}: unsupported_file_type")
            continue

        data = await file.read()
        if len(data) > settings.upload_max_bytes:
            errors.append(f"{file.filename}: file_too_large (>{settings.upload_max_bytes // (1024*1024)}MB)")
            continue

        file_title = title.strip() if (title.strip() and len(files) == 1) else Path(file.filename).stem
        lit = Literature(
            project_id=project_id,
            title=file_title,
            source="upload",
            rag_status="pending",
        )
        db.add(lit)
        db.flush()

        upload_root = Path(settings.upload_root).resolve()
        target_dir = upload_root / str(project_id) / str(lit.id)
        target_dir.mkdir(parents=True, exist_ok=True)

        fname = _safe_filename(file.filename)
        dest_abs = target_dir / fname
        dest_abs.write_bytes(data)

        lit.file_path = f"{project_id}/{lit.id}/{fname}"
        db.add(lit)
        results.append({"id": str(lit.id), "title": lit.title, "file_path": lit.file_path, "rag_status": lit.rag_status})

    if not results and errors:
        raise HTTPException(status_code=400, detail="; ".join(errors))

    db.commit()
    return {"uploaded": results, "errors": errors, "count": len(results)}


@router.delete("/{literature_id}")
def delete_literature(
    writer: WriterUserDep,
    db: DbSessionDep,
    project_id: UUID,
    literature_id: UUID,
) -> dict[str, str]:
    _require_project(db, writer, project_id)
    lit = db.get(Literature, literature_id)
    if lit is None or lit.project_id != project_id:
        raise HTTPException(status_code=404, detail="Literature not found")
    db.delete(lit)
    db.commit()
    return {"status": "deleted", "id": str(literature_id)}


@router.post("/relevance-check")
async def check_relevance(
    writer: WriterUserDep,
    db: DbSessionDep,
    settings: SettingsDep,
    llm: LLMServiceDep,
    project_id: UUID,
    payload: LiteratureRelevanceRequest,
) -> dict[str, object]:
    """AI-powered relevance assessment: checks if a literature item fits this project."""
    project = _require_project(db, writer, project_id)
    lit = db.get(Literature, payload.literature_id)
    if lit is None or lit.project_id != project.id:
        raise HTTPException(status_code=404, detail="Literature not found")

    model_id = payload.model_id
    if model_id:
        model = db.get(ModelCatalog, model_id)
    else:
        stmt = (
            select(ModelCatalog)
            .where(ModelCatalog.enabled.is_(True))
            .order_by(ModelCatalog.sort_order)
        )
        model = db.scalars(stmt).first()
    if model is None:
        raise HTTPException(status_code=400, detail="No model available")

    text = resolve_literature_text(lit, settings.upload_root)[:12000]
    if not text:
        text = f"标题：{lit.title}\n作者：{lit.authors or ''}\n摘要：{lit.abstract or ''}"

    prompt = (
        "你是学术文献匹配专家。判断以下文献是否与用户的论文项目相关，并给出推荐建议。\n"
        "输出纯JSON：{\"score\": 0-100, \"recommendation\": \"strongly_recommend|recommend|neutral|not_recommend\", \"reason\": \"简短理由\"}"
    )
    content = await llm.call(
        user_id=writer.id,
        project_id=project.id,
        agent_name="literature_relevance",
        scenario="literature_relevance",
        model=model,
        messages=[
            {"role": "system", "content": prompt},
            {
                "role": "user",
                "content": (
                    f"论文项目：{project.degree_level} / {project.discipline}\n"
                    f"题目：{project.title or project.topic or '未定'}\n"
                    f"主题：{project.topic or '未定'}\n\n"
                    f"文献信息：\n{text}"
                ),
            },
        ],
    )

    try:
        start = content.find("{")
        end = content.rfind("}") + 1
        data = json.loads(content[start:end]) if start >= 0 else {}
    except (json.JSONDecodeError, ValueError):
        data = {"score": 70, "recommendation": "neutral", "reason": "AI 未返回有效 JSON"}

    score = int(data.get("score", 70))
    recommendation = data.get("recommendation", "neutral")
    reason = data.get("reason", "")

    return {
        "literature_id": str(lit.id),
        "title": lit.title,
        "score": score,
        "recommendation": recommendation,
        "reason": reason,
        "should_add_to_library": recommendation in ("strongly_recommend", "recommend"),
    }


@router.post("/search")
async def search_literature(
    writer: WriterUserDep,
    db: DbSessionDep,
    llm: LLMServiceDep,
    project_id: UUID,
    payload: LiteratureSearchRequest,
) -> dict[str, object]:
    """
    Paid literature search service.
    The system uses AI to suggest relevant literature based on the project topic.
    In production this would call Semantic Scholar / Google Scholar APIs;
    currently uses LLM to generate search suggestions and mock results.
    """
    project = _require_project(db, writer, project_id)

    model_id = payload.model_id
    if model_id:
        model = db.get(ModelCatalog, model_id)
    else:
        stmt = (
            select(ModelCatalog)
            .where(ModelCatalog.enabled.is_(True))
            .order_by(ModelCatalog.sort_order)
        )
        model = db.scalars(stmt).first()
    if model is None:
        raise HTTPException(status_code=400, detail="No model available")

    prompt = (
        "你是学术文献检索助手。根据用户的研究主题，推荐最相关的学术文献。\n"
        "输出纯JSON数组，每项：{\"title\": \"\", \"authors\": \"\", \"year\": 2024, \"journal\": \"\", \"abstract\": \"简短摘要\", \"doi\": \"\"}\n"
        f"返回最多 {payload.max_results} 条。所有文献必须真实存在，不要编造。如果不确定真实性，标注 doi 为空。"
    )

    content = await llm.call(
        user_id=writer.id,
        project_id=project.id,
        agent_name="literature_search",
        scenario="literature_search",
        model=model,
        messages=[
            {"role": "system", "content": prompt},
            {
                "role": "user",
                "content": (
                    f"学科：{project.discipline}\n"
                    f"层次：{project.degree_level}\n"
                    f"题目：{project.title or '未定'}\n"
                    f"搜索词：{payload.query}"
                ),
            },
        ],
    )

    try:
        start = content.find("[")
        end = content.rfind("]") + 1
        results = json.loads(content[start:end]) if start >= 0 else []
    except (json.JSONDecodeError, ValueError):
        results = []

    if not isinstance(results, list):
        results = []

    return {
        "project_id": str(project.id),
        "query": payload.query,
        "results": results[:payload.max_results],
        "note": "此为付费文献搜索服务，已消耗 AI 调用额度。搜索结果可直接添加到文献库。",
    }


@router.post("/import")
def legacy_import_stub(
    writer: WriterUserDep,
    db: DbSessionDep,
    project_id: UUID,
) -> dict[str, str]:
    """Deprecated BibTeX import placeholder — use POST /upload or POST /."""
    _require_project(db, writer, project_id)
    return {"status": "unsupported", "project_id": str(project_id), "hint": "use POST .../literature or .../literature/upload"}
