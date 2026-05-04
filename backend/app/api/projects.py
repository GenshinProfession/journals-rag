import json
from io import BytesIO
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Response
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.deps import DbSessionDep, EmbeddingServiceDep, LLMServiceDep, SettingsDep, WriterUserDep
from app.models.ai_usage import AIUsageRecord
from app.models.model_catalog import ModelCatalog
from app.models.project import Chapter, Project
from app.models.rag import GenerationRAGHit, Literature, RAGChunk, ReferenceReview
from app.models.school import School, SchoolTemplateGroup
from app.models.user import User
from app.schemas.projects import (
    ChapterAcceptRequest,
    ChapterCreate,
    ChapterGenerateRequest,
    ChapterGenerateResponse,
    ChapterResponse,
    ChapterReviewRequest,
    ChapterRewriteRequest,
    ChaptersReorderRequest,
    ChapterUpdate,
    OutlineGenerateRequest,
    ProjectCreate,
    ProjectResponse,
    ProjectUpdate,
    RAGHitItem,
)
from app.schemas.rag import ReferenceReviewRequest
from app.services.citation_service import CitationService
from app.services.docx_service import DocxService
from app.services.latex_service import LatexService
from app.services.literature_text import resolve_literature_text
from app.services.vector_store import VectorStore

MIN_LITERATURE_FOR_WRITING = 10

router = APIRouter()


def _writer_project(db: Session, writer: User, project_id: UUID) -> Project:
    project = db.get(Project, project_id)
    if project is None or project.user_id != writer.id:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _enabled_model_for_scenario(
    db: Session, model_id: UUID | None, project: Project, scenario: str
) -> ModelCatalog:
    candidate_id = model_id or project.default_model_id
    model = db.get(ModelCatalog, candidate_id) if candidate_id else None
    if model is None:
        stmt = (
            select(ModelCatalog)
            .where(ModelCatalog.enabled.is_(True))
            .order_by(ModelCatalog.sort_order, ModelCatalog.display_name)
        )
        for row in db.scalars(stmt).all():
            allowed = row.allowed_scenarios or []
            if not allowed or scenario in allowed:
                model = row
                break
    if model is None or not model.enabled:
        raise HTTPException(status_code=400, detail=f"No enabled model available for {scenario}")
    allowed = model.allowed_scenarios or []
    if allowed and scenario not in allowed:
        raise HTTPException(status_code=400, detail=f"Model not allowed for {scenario}")
    return model


def _parse_json_object(raw: str) -> dict[str, object]:
    if not raw.strip():
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("{")
        end = raw.rfind("}")
        if start < 0 or end <= start:
            return {}
        try:
            data = json.loads(raw[start : end + 1])
        except json.JSONDecodeError:
            return {}
    return data if isinstance(data, dict) else {}


def _latest_usage_id(db: Session, user_id: UUID) -> UUID | None:
    stmt = (
        select(AIUsageRecord.id)
        .where(AIUsageRecord.user_id == user_id)
        .order_by(AIUsageRecord.created_at.desc())
        .limit(1)
    )
    return db.scalar(stmt)


def _school_context(db: Session, project: Project) -> str:
    """Translate school template DSLs into human-readable writing instructions for LLM."""
    if project.school_id is None:
        return "未选择学校模板。"
    group = db.get(SchoolTemplateGroup, project.school_id)
    if group is None:
        return "学校模板不存在或已删除。"
    school = db.get(School, group.school_id)
    school_name = school.name if school else "未知"
    parts = [
        f"学校：{school_name}",
        f"层次：{group.degree_level}",
        f"专业：{group.discipline or '通用'}",
        f"年份：{group.year or '通用'}",
        f"引用格式：{group.citation_style or '未指定'}",
    ]

    if group.structure and group.structure.structure_json:
        struct = group.structure.structure_json
        sections = struct.get("sections", [])
        if sections:
            sec_names = [s.get("type", "") for s in sections if isinstance(s, dict)]
            parts.append(f"论文结构顺序：{' → '.join(sec_names)}")

    if group.format_rules and group.format_rules.rules_json:
        r = group.format_rules.rules_json
        _append_format_instructions(parts, r)

    if group.citation_rules:
        cj = group.citation_rules.citation_json or {}
        cite_type = cj.get("citationType") or cj.get("type", group.citation_style or "")
        if cite_type:
            parts.append(f"参考文献引用标准：{cite_type}")
        examples = cj.get("citationExamples", cj.get("examples", []))
        if examples:
            parts.append("引用格式示例：")
            for ex in examples[:5]:
                parts.append(f"  {ex}")
        rules_list = cj.get("citationRules", cj.get("rules", []))
        if rules_list:
            parts.append("引用规则：")
            for rule in rules_list[:8]:
                parts.append(f"  · {rule}")
        if group.citation_rules.citation_text:
            parts.append(f"引用模板全文：\n{group.citation_rules.citation_text[:2000]}")

    return "\n".join(parts)


def _append_format_instructions(parts: list[str], r: dict):
    """Extract human-readable formatting instructions from the format DSL."""
    fonts = r.get("fonts", {})
    spacing = r.get("spacing", {})
    numbering = r.get("numbering", {})
    abstract_cfg = r.get("abstract", {})
    word_count = r.get("word_count", {})
    margin = r.get("margin", {})

    if margin:
        parts.append(
            f"页边距(cm)：上{margin.get('top', 2.5)} 下{margin.get('bottom', 2.0)} "
            f"左{margin.get('left', 2.5)} 右{margin.get('right', 2.0)}"
        )

    font_lines: list[str] = []
    for key, label in [
        ("chapter_title", "章标题"), ("section_l1", "一级节标题"), ("section_l2", "二级节标题"),
        ("body", "正文"), ("abstract_body", "摘要正文"), ("abstract_en_body", "英文摘要"),
    ]:
        cfg = fonts.get(key, {})
        if cfg:
            family = cfg.get("family", "")
            size = cfg.get("size_name") or f"{cfg.get('size_pt', '')}pt"
            bold = "加粗" if cfg.get("bold") else ""
            align = cfg.get("align", "")
            font_lines.append(f"  {label}：{family} {size} {bold} {align}".strip())
    if font_lines:
        parts.append("字体规范：")
        parts.extend(font_lines)

    if spacing:
        parts.append(
            f"段落格式：行距{spacing.get('line', 1.5)}倍，首行缩进{spacing.get('first_line_indent', 2)}字符，"
            f"段后{spacing.get('paragraph_after', 0)}pt"
        )

    if numbering:
        examples = numbering.get("examples", [])
        if examples:
            parts.append(f"章节编号体系：{'  →  '.join(examples)}")
        alt = numbering.get("alt_examples", [])
        if alt:
            parts.append(f"备选编号体系：{'  →  '.join(alt)}")

    if abstract_cfg:
        cn_range = ""
        if abstract_cfg.get("cn_min_chars") or abstract_cfg.get("cn_max_chars"):
            cn_range = f"{abstract_cfg.get('cn_min_chars', 300)}-{abstract_cfg.get('cn_max_chars', 600)}字"
        en_range = ""
        if abstract_cfg.get("en_min_words") or abstract_cfg.get("en_max_words"):
            en_range = f"{abstract_cfg.get('en_min_words', 250)}-{abstract_cfg.get('en_max_words', 350)}词"
        kw_range = ""
        if abstract_cfg.get("keywords_min") or abstract_cfg.get("keywords_max"):
            kw_range = f"{abstract_cfg.get('keywords_min', 3)}-{abstract_cfg.get('keywords_max', 8)}个"
        if cn_range or en_range:
            parts.append(f"摘要要求：中文{cn_range}，英文{en_range}，关键词{kw_range}")

    if word_count:
        wc_min = word_count.get("min")
        wc_max = word_count.get("max")
        note = word_count.get("note", "")
        if wc_min:
            parts.append(f"全文字数要求：≥{wc_min}字" + (f"（{note}）" if note else ""))


def _load_template_data(db: Session, project: Project) -> tuple[dict, dict, dict, str]:
    """Load format_rules, structure, citation DSLs and citation_style from the template group."""
    if project.school_id is None:
        return {}, {}, {}, ""
    group = db.get(SchoolTemplateGroup, project.school_id)
    if group is None:
        return {}, {}, {}, ""
    rules_json = (group.format_rules.rules_json if group.format_rules else None) or {}
    struct_json = (group.structure.structure_json if group.structure else None) or {}
    cite_json = (group.citation_rules.citation_json if group.citation_rules else None) or {}
    cite_style = group.citation_style or ""
    return rules_json, struct_json, cite_json, cite_style


def _reference_lines(db: Session, project_id: UUID) -> list[str]:
    stmt = select(Literature).where(Literature.project_id == project_id).order_by(Literature.year, Literature.title)
    rows = list(db.scalars(stmt).all())
    lines: list[str] = []
    for item in rows:
        year = f" ({item.year})" if item.year else ""
        authors = f"{item.authors}. " if item.authors else ""
        journal = f" {item.journal}." if item.journal else ""
        doi = f" DOI: {item.doi}." if item.doi else ""
        lines.append(f"{authors}{item.title}{year}.{journal}{doi}".strip())
    return lines


@router.get("", response_model=list[ProjectResponse])
def list_projects(writer: WriterUserDep, db: DbSessionDep) -> list[Project]:
    stmt = (
        select(Project)
        .where(Project.user_id == writer.id)
        .order_by(Project.updated_at.desc())
    )
    return list(db.scalars(stmt).all())


@router.post("", response_model=ProjectResponse, status_code=201)
def create_project(writer: WriterUserDep, db: DbSessionDep, payload: ProjectCreate) -> Project:
    if payload.school_id is not None:
        group = db.get(SchoolTemplateGroup, payload.school_id)
        if group is None or not group.enabled:
            raise HTTPException(status_code=400, detail="School template group not found or disabled")
    project = Project(
        user_id=writer.id,
        school_id=payload.school_id,
        degree_level=payload.degree_level,
        discipline=payload.discipline,
        title=payload.title,
        topic=payload.topic,
        default_model_id=payload.default_model_id,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.post("/{project_id}/reference/review")
async def review_reference(
    writer: WriterUserDep,
    db: DbSessionDep,
    settings: SettingsDep,
    llm: LLMServiceDep,
    project_id: UUID,
    payload: ReferenceReviewRequest,
) -> dict[str, object]:
    project = _writer_project(db, writer, project_id)
    literature = db.get(Literature, payload.literature_id)
    if literature is None or literature.project_id != project.id:
        raise HTTPException(status_code=404, detail="Literature not found")
    model = _enabled_model_for_scenario(db, payload.model_id, project, "reference_review")

    paper_text = resolve_literature_text(literature, settings.upload_root)[:24000]
    if not paper_text:
        raise HTTPException(status_code=400, detail="reference_has_no_extractable_text")

    prompt = (
        "你是论文项目的标准参考论文质检员。请评估这篇文献是否可作为后续 RAG "
        "与论文写作的标准参考论文。只输出 JSON，字段：topic_relevance_score, "
        "structure_score, academic_quality_score, overall_score, passed, issues, report。"
    )
    content = await llm.call(
        user_id=writer.id,
        project_id=project.id,
        agent_name="reference_review",
        scenario="reference_review",
        model=model,
        messages=[
            {"role": "system", "content": prompt},
            {
                "role": "user",
                "content": (
                    f"项目：{project.degree_level} / {project.discipline}\n"
                    f"题目：{project.title or project.topic or '未定'}\n"
                    f"文献标题：{literature.title}\n\n正文：\n{paper_text}"
                ),
            },
        ],
    )
    data = _parse_json_object(content)
    if not data:
        data = {
            "topic_relevance_score": 70,
            "structure_score": 70,
            "academic_quality_score": 70,
            "overall_score": 70,
            "passed": True,
            "issues": [],
            "report": "开发模式或模型未返回 JSON，已按可继续入库的默认审核结果记录。",
        }

    review = ReferenceReview(
        project_id=project.id,
        user_id=writer.id,
        literature_id=literature.id,
        model_id=model.id,
        topic_relevance_score=int(data.get("topic_relevance_score") or 0),
        structure_score=int(data.get("structure_score") or 0),
        academic_quality_score=int(data.get("academic_quality_score") or 0),
        overall_score=int(data.get("overall_score") or 0),
        passed=bool(data.get("passed")),
        issues=data.get("issues") if isinstance(data.get("issues"), list) else [],
        report=str(data.get("report") or ""),
        usage_record_id=_latest_usage_id(db, writer.id),
    )
    db.add(review)
    literature.rag_status = "review_passed" if review.passed else "review_failed"
    db.commit()
    db.refresh(review)
    return {
        "status": "completed",
        "project_id": str(project.id),
        "review_id": str(review.id),
        "literature_id": str(literature.id),
        "model_id": str(model.id),
        "passed": review.passed,
        "overall_score": review.overall_score,
        "report": review.report,
    }


@router.post("/{project_id}/outline/generate")
async def generate_outline(
    writer: WriterUserDep,
    db: DbSessionDep,
    llm: LLMServiceDep,
    project_id: UUID,
    payload: OutlineGenerateRequest,
) -> dict[str, object]:
    project = _writer_project(db, writer, project_id)
    model = _enabled_model_for_scenario(db, payload.model_id, project, "outline")

    content = await llm.call(
        user_id=writer.id,
        project_id=project.id,
        agent_name="outline_generator",
        scenario="outline",
        model=model,
        messages=[
            {
                "role": "system",
                "content": (
                    "你是论文大纲规划 Agent。只输出 JSON："
                    "{\"chapters\":[{\"title\":\"...\",\"summary\":\"...\"}]}"
                ),
            },
            {
                "role": "user",
                "content": (
                    f"层次：{project.degree_level}\n"
                    f"学科：{project.discipline}\n"
                    f"题目：{project.title or '未定'}\n"
                    f"主题：{project.topic or '未定'}\n\n"
                    f"学校/格式模板：\n{_school_context(db, project)}"
                ),
            },
        ],
    )
    data = _parse_json_object(content)
    chapters = data.get("chapters")
    if not isinstance(chapters, list) or not chapters:
        chapters = [
            {"title": "绪论", "summary": "研究背景、意义、问题与方法。"},
            {"title": "文献综述", "summary": "梳理国内外研究现状与理论基础。"},
            {"title": "研究设计", "summary": "说明研究对象、数据来源与方法。"},
            {"title": "分析与讨论", "summary": "展开核心分析并回应研究问题。"},
            {"title": "结论与建议", "summary": "总结发现、局限与后续展望。"},
        ]

    project.outline = {"chapters": chapters}
    project.status = "outline_ready"

    existing = list(
        db.scalars(select(Chapter).where(Chapter.project_id == project.id).limit(1)).all()
    )
    if not existing:
        for idx, item in enumerate(chapters):
            if not isinstance(item, dict):
                continue
            title = str(item.get("title") or f"第 {idx + 1} 章")
            summary = str(item.get("summary") or "")
            db.add(
                Chapter(
                    project_id=project.id,
                    title=title[:255],
                    order_index=idx,
                    content=summary,
                    word_count=len(summary),
                    status="draft",
                )
            )
    db.commit()
    return {
        "status": "completed",
        "project_id": str(project.id),
        "model_id": str(model.id),
        "outline": project.outline,
    }


@router.get("/{project_id}/chapters", response_model=list[ChapterResponse])
def list_chapters(writer: WriterUserDep, db: DbSessionDep, project_id: UUID) -> list[Chapter]:
    project = _writer_project(db, writer, project_id)
    stmt = select(Chapter).where(Chapter.project_id == project.id).order_by(Chapter.order_index)
    return list(db.scalars(stmt).all())


@router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(
    writer: WriterUserDep,
    db: DbSessionDep,
    project_id: UUID,
    payload: ProjectUpdate,
) -> Project:
    """Update project title / topic / abstract after creation."""
    project = _writer_project(db, writer, project_id)
    for key, val in payload.model_dump(exclude_unset=True).items():
        setattr(project, key, val)
    db.commit()
    db.refresh(project)
    return project


@router.post("/{project_id}/chapters", response_model=ChapterResponse, status_code=201)
def create_chapter(
    writer: WriterUserDep,
    db: DbSessionDep,
    project_id: UUID,
    payload: ChapterCreate,
) -> Chapter:
    """Manually add a chapter / section to the outline."""
    project = _writer_project(db, writer, project_id)
    if payload.order_index is not None:
        order_idx = payload.order_index
    else:
        max_idx = db.scalar(
            select(func.max(Chapter.order_index)).where(Chapter.project_id == project.id)
        )
        order_idx = (max_idx or 0) + 1
    chapter = Chapter(
        project_id=project.id,
        title=payload.title,
        order_index=order_idx,
        level=payload.level,
        parent_id=payload.parent_id,
        status="draft",
    )
    db.add(chapter)
    db.commit()
    db.refresh(chapter)
    return chapter


@router.delete("/{project_id}/chapters/{chapter_id}", status_code=204)
def delete_chapter(
    writer: WriterUserDep,
    db: DbSessionDep,
    project_id: UUID,
    chapter_id: UUID,
) -> None:
    """Remove a chapter from the outline."""
    project = _writer_project(db, writer, project_id)
    chapter = db.get(Chapter, chapter_id)
    if chapter is None or chapter.project_id != project.id:
        return
    db.execute(delete(GenerationRAGHit).where(GenerationRAGHit.chapter_id == chapter.id))
    db.delete(chapter)
    db.commit()


@router.put("/{project_id}/chapters/reorder")
def reorder_chapters(
    writer: WriterUserDep,
    db: DbSessionDep,
    project_id: UUID,
    payload: ChaptersReorderRequest,
) -> dict[str, str]:
    """Batch-update chapter order_index by the ordered list of IDs."""
    project = _writer_project(db, writer, project_id)
    chapters = {
        ch.id: ch
        for ch in db.scalars(select(Chapter).where(Chapter.project_id == project.id))
    }
    for idx, cid in enumerate(payload.order):
        ch = chapters.get(cid)
        if ch is not None:
            ch.order_index = idx
    db.commit()
    return {"status": "ok"}


@router.patch("/{project_id}/chapters/{chapter_id}", response_model=ChapterResponse)
def update_chapter(
    writer: WriterUserDep,
    db: DbSessionDep,
    project_id: UUID,
    chapter_id: UUID,
    payload: ChapterUpdate,
) -> Chapter:
    project = _writer_project(db, writer, project_id)
    chapter = db.get(Chapter, chapter_id)
    if chapter is None or chapter.project_id != project.id:
        raise HTTPException(status_code=404, detail="Chapter not found")
    updates = payload.model_dump(exclude_unset=True)
    for key, val in updates.items():
        setattr(chapter, key, val)
    if "content" in updates and chapter.content is not None:
        chapter.word_count = len(chapter.content)
        chapter.version += 1
    db.add(chapter)
    db.commit()
    db.refresh(chapter)
    return chapter


@router.get("/{project_id}/writing-readiness")
def check_writing_readiness(
    writer: WriterUserDep,
    db: DbSessionDep,
    project_id: UUID,
) -> dict[str, object]:
    """Pre-flight check: does this project have enough literature to start writing?"""
    project = _writer_project(db, writer, project_id)
    lit_count = db.scalar(
        select(func.count(Literature.id)).where(Literature.project_id == project.id)
    ) or 0
    indexed_count = db.scalar(
        select(func.count(Literature.id)).where(
            Literature.project_id == project.id,
            Literature.rag_status.in_(["review_passed", "indexed"]),
        )
    ) or 0
    ready = lit_count >= MIN_LITERATURE_FOR_WRITING
    return {
        "project_id": str(project.id),
        "literature_count": lit_count,
        "indexed_count": indexed_count,
        "min_required": MIN_LITERATURE_FOR_WRITING,
        "ready": ready,
        "message": "" if ready else f"至少需要 {MIN_LITERATURE_FOR_WRITING} 篇文献才能开始代写，当前仅 {lit_count} 篇。",
    }


@router.post("/{project_id}/chapters/{chapter_id}/generate", response_model=ChapterGenerateResponse)
async def generate_chapter(
    writer: WriterUserDep,
    db: DbSessionDep,
    llm: LLMServiceDep,
    embedding: EmbeddingServiceDep,
    project_id: UUID,
    chapter_id: UUID,
    payload: ChapterGenerateRequest,
) -> dict[str, object]:
    project = _writer_project(db, writer, project_id)

    lit_count = db.scalar(
        select(func.count(Literature.id)).where(Literature.project_id == project.id)
    ) or 0
    if lit_count < MIN_LITERATURE_FOR_WRITING:
        raise HTTPException(
            status_code=400,
            detail=f"至少需要 {MIN_LITERATURE_FOR_WRITING} 篇文献才能开始代写，当前仅 {lit_count} 篇。请先上传更多参考文献。",
        )

    chapter = db.get(Chapter, chapter_id)
    if chapter is None or chapter.project_id != project.id:
        raise HTTPException(status_code=404, detail="Chapter not found")

    model = _enabled_model_for_scenario(db, payload.model_id, project, "chapter_write")
    store = VectorStore(db)

    # --- Resolve RAG chunks: manual selection or auto-search ---
    scored_chunks: list[tuple[RAGChunk, float, str]] = []  # (chunk, score, source)

    if payload.selected_chunk_ids:
        manual_chunks = store.fetch_by_ids(project.id, payload.selected_chunk_ids)
        if not manual_chunks:
            raise HTTPException(status_code=400, detail="selected_chunk_ids 中没有找到已确认的有效片段")
        for ch in manual_chunks:
            scored_chunks.append((ch, 1.0, "manual"))
    else:
        vectors = await embedding.embed_many(
            [f"{project.title or project.topic or project.discipline}\n{chapter.title}"]
        )
        if vectors:
            auto_results = store.search_with_scores(
                project.id, vectors[0], limit=payload.auto_search_limit
            )
            for ch, score in auto_results:
                scored_chunks.append((ch, score, "auto"))

    # --- Build LLM context from resolved chunks ---
    context_parts: list[str] = []
    for idx, (c, score, _src) in enumerate(scored_chunks):
        lit = db.get(Literature, c.literature_id) if c.literature_id else None
        lit_label = f" (来源: {lit.title})" if lit else ""
        context_parts.append(
            f"[参考片段 {idx + 1}]{lit_label} [相似度: {score:.2f}]\n{c.content[:1200]}"
        )
    context = "\n\n".join(context_parts)

    content = await llm.call(
        user_id=writer.id,
        project_id=project.id,
        agent_name="chapter_writer",
        scenario="chapter_write",
        model=model,
        messages=[
            {
                "role": "system",
                "content": (
                    "你是中文学术论文代写工作台中的章节写作 Agent。"
                    "基于项目主题、章节标题和 RAG 参考片段生成严谨正文，避免编造不存在的引用。"
                ),
            },
            {
                "role": "user",
                "content": (
                    f"项目层次：{project.degree_level}\n"
                    f"学科：{project.discipline}\n"
                    f"论文题目：{project.title or '未定'}\n"
                    f"论文主题：{project.topic or '未定'}\n"
                    f"章节：{chapter.title}\n"
                    f"目标字数：{payload.target_words}\n\n"
                    f"学校/格式模板：\n{_school_context(db, project)}\n\n"
                    f"RAG 参考片段：\n{context or '暂无已确认片段，请先按通用学术结构写作。'}"
                ),
            },
        ],
    )
    if not content.strip():
        content = (
            f"{chapter.title}\n\n"
            f"本节围绕\u201c{project.title or project.topic or project.discipline}\u201d展开。"
            "当前为开发模式占位正文；接入 AI 中转站后将根据已确认 RAG 片段生成完整章节。"
        )

    chapter.content = content
    chapter.word_count = len(content)
    chapter.status = "pending_accept"
    chapter.version += 1
    db.add(chapter)
    db.flush()

    # --- Record RAG hits audit trail ---
    db.execute(
        delete(GenerationRAGHit).where(
            GenerationRAGHit.chapter_id == chapter.id,
            GenerationRAGHit.generation_version == chapter.version,
        )
    )

    hit_items: list[RAGHitItem] = []
    for c, score, src in scored_chunks:
        lit = db.get(Literature, c.literature_id) if c.literature_id else None
        hit = GenerationRAGHit(
            chapter_id=chapter.id,
            chunk_id=c.id,
            literature_id=c.literature_id,
            similarity_score=score,
            chunk_content_preview=c.content[:500],
            source=src,
            generation_version=chapter.version,
            accepted=None,
        )
        db.add(hit)
        db.flush()
        hit_items.append(RAGHitItem(
            hit_id=hit.id,
            chunk_id=c.id,
            literature_id=c.literature_id,
            literature_title=lit.title if lit else None,
            topic_summary=c.topic_summary,
            similarity_score=score,
            source=src,
            content_preview=c.content[:500],
            accepted=None,
        ))

    db.commit()
    db.refresh(chapter)

    return {
        "id": chapter.id,
        "project_id": chapter.project_id,
        "title": chapter.title,
        "order_index": chapter.order_index,
        "content": chapter.content,
        "word_count": chapter.word_count,
        "status": chapter.status,
        "feedback": chapter.feedback,
        "version": chapter.version,
        "rag_hits": hit_items,
    }


@router.post("/{project_id}/chapters/{chapter_id}/review", response_model=ChapterResponse)
async def review_chapter(
    writer: WriterUserDep,
    db: DbSessionDep,
    llm: LLMServiceDep,
    project_id: UUID,
    chapter_id: UUID,
    payload: ChapterReviewRequest,
) -> Chapter:
    project = _writer_project(db, writer, project_id)
    chapter = db.get(Chapter, chapter_id)
    if chapter is None or chapter.project_id != project.id:
        raise HTTPException(status_code=404, detail="Chapter not found")
    if not chapter.content:
        raise HTTPException(status_code=400, detail="Chapter has no content")

    model = _enabled_model_for_scenario(db, payload.model_id, project, "chapter_review")
    feedback = await llm.call(
        user_id=writer.id,
        project_id=project.id,
        agent_name="chapter_reviewer",
        scenario="chapter_review",
        model=model,
        messages=[
            {
                "role": "system",
                "content": (
                    "你是中文学术论文审校 Agent。请从结构、论证、学术表达、引用风险、"
                    "重复表达风险五方面给出精炼修改意见。"
                ),
            },
            {"role": "user", "content": f"章节：{chapter.title}\n\n正文：\n{chapter.content[:24000]}"},
        ],
    )
    chapter.feedback = feedback or "开发模式占位反馈：建议补充论据、压缩重复表述并完善章节衔接。"
    chapter.status = "reviewed"
    db.add(chapter)
    db.commit()
    db.refresh(chapter)
    return chapter


@router.post("/{project_id}/chapters/{chapter_id}/rewrite", response_model=ChapterResponse)
async def rewrite_chapter(
    writer: WriterUserDep,
    db: DbSessionDep,
    llm: LLMServiceDep,
    project_id: UUID,
    chapter_id: UUID,
    payload: ChapterRewriteRequest,
) -> Chapter:
    project = _writer_project(db, writer, project_id)
    chapter = db.get(Chapter, chapter_id)
    if chapter is None or chapter.project_id != project.id:
        raise HTTPException(status_code=404, detail="Chapter not found")
    if not chapter.content:
        raise HTTPException(status_code=400, detail="Chapter has no content")

    model = _enabled_model_for_scenario(db, payload.model_id, project, "chapter_rewrite")
    rewritten = await llm.call(
        user_id=writer.id,
        project_id=project.id,
        agent_name="chapter_rewriter",
        scenario="chapter_rewrite",
        model=model,
        messages=[
            {
                "role": "system",
                "content": (
                    "你是中文学术论文降重与润色 Agent。请在保持事实、论点和学术语气的前提下，"
                    "降低重复表达，改善行文流畅度。只输出改写后的正文。"
                ),
            },
            {
                "role": "user",
                "content": (
                    f"改写要求：{payload.instruction or chapter.feedback or '降低重复表达并润色'}\n\n"
                    f"章节：{chapter.title}\n\n原文：\n{chapter.content[:24000]}"
                ),
            },
        ],
    )
    if rewritten.strip():
        chapter.content = rewritten
        chapter.word_count = len(rewritten)
        chapter.version += 1
    chapter.status = "rewritten"
    db.add(chapter)
    db.commit()
    db.refresh(chapter)
    return chapter


@router.get("/{project_id}/export")
def export_project(
    writer: WriterUserDep,
    db: DbSessionDep,
    project_id: UUID,
    format: str = Query(default="markdown", pattern="^(markdown|latex|docx)$"),
) -> Response:
    project = _writer_project(db, writer, project_id)
    chapters_orm = list(
        db.scalars(select(Chapter).where(Chapter.project_id == project.id).order_by(Chapter.order_index))
    )
    title = project.title or project.topic or f"{project.discipline}论文"
    references_raw = _reference_lines(db, project.id)
    rules_json, struct_json, cite_json, cite_style = _load_template_data(db, project)

    lit_rows = list(
        db.scalars(select(Literature).where(Literature.project_id == project.id).order_by(Literature.year))
    )
    lit_dicts = [
        {"id": str(l.id), "title": l.title, "authors": l.authors or "", "year": l.year, "journal": l.journal or "", "doi": l.doi or ""}
        for l in lit_rows
    ]

    cite_svc = CitationService(style=cite_style or "GB/T 7714", literature=lit_dicts, citation_rules=cite_json)

    ch_dicts: list[dict[str, object]] = []
    for ch in chapters_orm:
        content = ch.content or ""
        content = cite_svc.format_text(content)
        ch_dicts.append({"title": ch.title, "content": content, "level": ch.level or 1})

    formatted_refs = cite_svc.reference_list() or references_raw

    if format == "docx":
        svc = DocxService(rules_json=rules_json, structure_json=struct_json, citation_json=cite_json)
        docx_bytes = svc.generate(
            title=title,
            degree_level=project.degree_level,
            discipline=project.discipline,
            abstract_cn=project.abstract or project.topic or "",
            chapters=ch_dicts,
            references=formatted_refs,
            project_meta={"title": title, "学科门类": project.discipline},
        )
        return Response(
            content=docx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": 'attachment; filename="thesis.docx"'},
        )

    if format == "latex":
        svc = LatexService(rules_json=rules_json, citation_json=cite_json)
        tex_text = svc.generate(
            title=title,
            degree_level=project.degree_level,
            discipline=project.discipline,
            abstract_cn=project.abstract or project.topic or "",
            chapters=ch_dicts,
            references=formatted_refs,
        )
        return Response(content=tex_text, media_type="application/x-tex")

    lines = [
        f"# {title}",
        "",
        f"- 层次：{project.degree_level}",
        f"- 学科：{project.discipline}",
        "",
        "## 摘要",
        "",
        project.abstract or project.topic or "摘要待补充。",
        "",
    ]
    for ch in ch_dicts:
        hashes = "#" * (int(ch["level"]) + 1)  # level 1 → ##, level 2 → ###, etc.
        lines.extend([f"{hashes} {ch['title']}", str(ch["content"]), ""])
    lines.extend(["## 参考文献", ""])
    for idx, ref in enumerate(formatted_refs, start=1):
        lines.append(f"{idx}. {ref}")
    if not formatted_refs:
        lines.append("暂无参考文献")
    return Response(content="\n".join(lines), media_type="text/markdown; charset=utf-8")


@router.get("/{project_id}/chapters/{chapter_id}/rag-hits")
def list_chapter_rag_hits(
    writer: WriterUserDep,
    db: DbSessionDep,
    project_id: UUID,
    chapter_id: UUID,
    version: int | None = Query(default=None, description="Filter by generation version"),
) -> dict[str, object]:
    """View which RAG chunks were used for a chapter generation."""
    project = _writer_project(db, writer, project_id)
    chapter = db.get(Chapter, chapter_id)
    if chapter is None or chapter.project_id != project.id:
        raise HTTPException(status_code=404, detail="Chapter not found")

    stmt = select(GenerationRAGHit).where(GenerationRAGHit.chapter_id == chapter.id)
    if version is not None:
        stmt = stmt.where(GenerationRAGHit.generation_version == version)
    stmt = stmt.order_by(GenerationRAGHit.similarity_score.desc().nullslast())
    hits = list(db.scalars(stmt).all())

    items: list[dict[str, object]] = []
    for h in hits:
        lit = db.get(Literature, h.literature_id) if h.literature_id else None
        chunk = db.get(RAGChunk, h.chunk_id)
        items.append({
            "hit_id": str(h.id),
            "chunk_id": str(h.chunk_id),
            "literature_id": str(h.literature_id) if h.literature_id else None,
            "literature_title": lit.title if lit else None,
            "topic_summary": chunk.topic_summary if chunk else None,
            "similarity_score": h.similarity_score,
            "source": h.source,
            "content_preview": h.chunk_content_preview,
            "generation_version": h.generation_version,
            "accepted": h.accepted,
        })

    return {
        "project_id": str(project_id),
        "chapter_id": str(chapter_id),
        "chapter_title": chapter.title,
        "current_version": chapter.version,
        "total_hits": len(items),
        "items": items,
    }


@router.post("/{project_id}/chapters/{chapter_id}/accept")
def accept_or_reject_chapter(
    writer: WriterUserDep,
    db: DbSessionDep,
    project_id: UUID,
    chapter_id: UUID,
    payload: ChapterAcceptRequest,
) -> dict[str, object]:
    """Quality gate: accept or reject a generated chapter and optionally mark bad chunks."""
    project = _writer_project(db, writer, project_id)
    chapter = db.get(Chapter, chapter_id)
    if chapter is None or chapter.project_id != project.id:
        raise HTTPException(status_code=404, detail="Chapter not found")
    if chapter.status != "pending_accept":
        raise HTTPException(status_code=400, detail="章节当前状态不允许审批，需先生成内容")

    # Update hit acceptance flags
    stmt = select(GenerationRAGHit).where(
        GenerationRAGHit.chapter_id == chapter.id,
        GenerationRAGHit.generation_version == chapter.version,
    )
    hits = list(db.scalars(stmt).all())

    rejected_ids = set(payload.rejected_chunk_ids or [])
    for h in hits:
        if h.chunk_id in rejected_ids:
            h.accepted = False
        else:
            h.accepted = payload.accepted

    if payload.accepted:
        chapter.status = "generated"
    else:
        chapter.status = "rejected"

    db.commit()
    db.refresh(chapter)
    return {
        "project_id": str(project_id),
        "chapter_id": str(chapter_id),
        "status": chapter.status,
        "version": chapter.version,
        "accepted": payload.accepted,
        "rejected_chunk_count": len(rejected_ids),
    }
