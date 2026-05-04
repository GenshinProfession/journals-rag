from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select

from app.deps import (
    DbSessionDep,
    EmbeddingServiceDep,
    LLMServiceDep,
    SettingsDep,
    WriterUserDep,
)
from app.models.model_catalog import ModelCatalog
from app.models.project import Project
from app.models.rag import Literature, RAGChunk, RAGDocument
from app.schemas.rag import ChunkConfirmRequest, ChunkRequest, RAGSearchRequest
from app.services.rag_service import RAGService
from app.services.vector_store import VectorStore

router = APIRouter()


def _require_project(db: DbSessionDep, writer: WriterUserDep, project_id: UUID) -> Project:
    project = db.get(Project, project_id)
    if project is None or project.user_id != writer.id:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.post("/documents/{literature_id}/chunk")
async def chunk_document(
    writer: WriterUserDep,
    db: DbSessionDep,
    settings: SettingsDep,
    project_id: UUID,
    literature_id: UUID,
    payload: ChunkRequest,
) -> dict[str, object]:
    _require_project(db, writer, project_id)
    if payload.literature_id != literature_id:
        raise HTTPException(status_code=400, detail="literature_id mismatch")

    literature = db.get(Literature, literature_id)
    if literature is None or literature.project_id != project_id:
        raise HTTPException(status_code=404, detail="Literature not found")

    if db.get(ModelCatalog, payload.model_id) is None:
        raise HTTPException(status_code=404, detail="Model not found")
    if literature.rag_status != "review_passed":
        raise HTTPException(status_code=400, detail="Reference review must pass before chunking")

    service = RAGService(db, settings)
    try:
        doc, chunks = service.rebuild_draft_document(
            literature=literature,
            project_id=project_id,
            writer_id=writer.id,
            chunk_char_limit=payload.chunk_char_limit,
            overlap=payload.overlap,
            text_override=payload.text_override,
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err

    return {
        "status": "ready",
        "project_id": str(project_id),
        "document_id": str(doc.id),
        "literature_id": str(literature_id),
        "chunk_count": len(chunks),
        "preview": [
            {"id": str(c.id), "chunk_index": c.chunk_index, "preview": c.content[:400]}
            for c in chunks[:20]
        ],
    }


@router.get("/documents/{document_id}/chunks")
def list_chunks(
    writer: WriterUserDep,
    db: DbSessionDep,
    project_id: UUID,
    document_id: UUID,
) -> dict[str, object]:
    _require_project(db, writer, project_id)
    doc = db.get(RAGDocument, document_id)
    if doc is None or doc.project_id != project_id:
        raise HTTPException(status_code=404, detail="Document not found")
    stmt = select(RAGChunk).where(RAGChunk.document_id == document_id).order_by(RAGChunk.chunk_index)
    rows = db.scalars(stmt).all()
    return {
        "project_id": str(project_id),
        "document_id": str(document_id),
        "items": [
            {
                "id": str(c.id),
                "chunk_index": c.chunk_index,
                "status": c.status,
                "tokens": len(c.content) // 4,
                "content": c.content,
            }
            for c in rows
        ],
    }


@router.post("/documents/{document_id}/confirm")
async def confirm_chunks(
    writer: WriterUserDep,
    db: DbSessionDep,
    settings: SettingsDep,
    embedding: EmbeddingServiceDep,
    project_id: UUID,
    document_id: UUID,
    payload: ChunkConfirmRequest,
) -> dict[str, object]:
    _require_project(db, writer, project_id)
    doc = db.get(RAGDocument, document_id)
    if doc is None or doc.project_id != project_id:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.literature_id is None:
        raise HTTPException(status_code=400, detail="Document missing literature linkage")

    literature = db.get(Literature, doc.literature_id)
    if literature is None:
        raise HTTPException(status_code=404, detail="Literature not found")

    service = RAGService(db, settings)
    count = await service.finalize_confirmation(
        embedding,
        literature=literature,
        document=doc,
        chunk_ids=payload.chunk_ids,
    )
    return {
        "status": "indexed",
        "project_id": str(project_id),
        "document_id": str(document_id),
        "chunk_count": count,
    }


@router.post("/search")
async def search_rag(
    writer: WriterUserDep,
    db: DbSessionDep,
    settings: SettingsDep,
    embedding: EmbeddingServiceDep,
    project_id: UUID,
    payload: RAGSearchRequest,
) -> dict[str, object]:
    _require_project(db, writer, project_id)

    vectors = await embedding.embed_many([payload.query])
    if not vectors:
        raise HTTPException(status_code=500, detail="embedding_failed")
    qvec = vectors[0]

    store = VectorStore(db)
    results = store.search_with_scores(project_id=project_id, embedding=qvec, limit=payload.limit)
    items = []
    for ch, score in results:
        lit = db.get(Literature, ch.literature_id) if ch.literature_id else None
        items.append({
            "id": str(ch.id),
            "literature_id": str(ch.literature_id) if ch.literature_id else None,
            "literature_title": lit.title if lit else None,
            "topic_summary": ch.topic_summary,
            "chunk_index": ch.chunk_index,
            "text": ch.content[:800],
            "tokens": len(ch.content) // 4,
            "similarity_score": score,
        })
    return {
        "project_id": str(project_id),
        "items": items,
    }


@router.get("/chunks/browse")
def browse_chunks_by_literature(
    writer: WriterUserDep,
    db: DbSessionDep,
    project_id: UUID,
    literature_id: UUID | None = Query(default=None, description="Filter to a specific literature"),
    status: str | None = Query(default=None, description="Filter by chunk status: draft, confirmed"),
) -> dict[str, object]:
    """Browse RAG chunks grouped by literature, with topic summaries for easy review."""
    _require_project(db, writer, project_id)

    stmt = select(RAGChunk).where(RAGChunk.project_id == project_id)
    if literature_id is not None:
        stmt = stmt.where(RAGChunk.literature_id == literature_id)
    if status is not None:
        stmt = stmt.where(RAGChunk.status == status)
    stmt = stmt.order_by(RAGChunk.literature_id, RAGChunk.chunk_index)
    chunks = list(db.scalars(stmt).all())

    # Group by literature
    groups: dict[str, dict[str, object]] = {}
    for c in chunks:
        lit_key = str(c.literature_id) if c.literature_id else "__none__"
        if lit_key not in groups:
            lit = db.get(Literature, c.literature_id) if c.literature_id else None
            groups[lit_key] = {
                "literature_id": lit_key if lit_key != "__none__" else None,
                "literature_title": lit.title if lit else None,
                "literature_rag_status": lit.rag_status if lit else None,
                "chunks": [],
            }
        groups[lit_key]["chunks"].append({
            "id": str(c.id),
            "chunk_index": c.chunk_index,
            "status": c.status,
            "topic_summary": c.topic_summary,
            "tokens": len(c.content) // 4,
            "content_preview": c.content[:400],
        })

    return {
        "project_id": str(project_id),
        "total_chunks": len(chunks),
        "literature_groups": list(groups.values()),
    }


@router.post("/chunks/{chunk_id}/generate-topic")
async def generate_chunk_topic(
    writer: WriterUserDep,
    db: DbSessionDep,
    llm: LLMServiceDep,
    project_id: UUID,
    chunk_id: UUID,
) -> dict[str, object]:
    """AI-extract a topic summary for a chunk so humans can quickly assess relevance."""
    project = _require_project(db, writer, project_id)
    chunk = db.get(RAGChunk, chunk_id)
    if chunk is None or chunk.project_id != project_id:
        raise HTTPException(status_code=404, detail="Chunk not found")

    model_stmt = (
        select(ModelCatalog)
        .where(ModelCatalog.enabled.is_(True))
        .order_by(ModelCatalog.sort_order)
    )
    model = db.scalars(model_stmt).first()
    if model is None:
        raise HTTPException(status_code=400, detail="No model available")

    content = await llm.call(
        user_id=writer.id,
        project_id=project.id,
        agent_name="chunk_topic_extractor",
        scenario="chunk_topic",
        model=model,
        messages=[
            {
                "role": "system",
                "content": (
                    "你是学术文本主题提取专家。阅读以下文本片段，用一句话（不超过80字）总结其核心主题。"
                    "只输出主题摘要，不要任何多余文字。"
                ),
            },
            {"role": "user", "content": chunk.content[:2000]},
        ],
    )
    topic = content.strip()[:500] if content else None
    chunk.topic_summary = topic
    db.commit()
    db.refresh(chunk)
    return {
        "chunk_id": str(chunk.id),
        "topic_summary": chunk.topic_summary,
    }


@router.post("/chunks/batch-generate-topics")
async def batch_generate_chunk_topics(
    writer: WriterUserDep,
    db: DbSessionDep,
    llm: LLMServiceDep,
    project_id: UUID,
    literature_id: UUID | None = Query(default=None),
) -> dict[str, object]:
    """Batch-generate topic summaries for all confirmed chunks missing one."""
    project = _require_project(db, writer, project_id)

    stmt = select(RAGChunk).where(
        RAGChunk.project_id == project_id,
        RAGChunk.status == "confirmed",
        RAGChunk.topic_summary.is_(None),
    )
    if literature_id is not None:
        stmt = stmt.where(RAGChunk.literature_id == literature_id)
    stmt = stmt.order_by(RAGChunk.chunk_index).limit(50)
    chunks = list(db.scalars(stmt).all())

    if not chunks:
        return {"project_id": str(project_id), "processed": 0, "message": "所有片段已有主题摘要"}

    model_stmt = (
        select(ModelCatalog)
        .where(ModelCatalog.enabled.is_(True))
        .order_by(ModelCatalog.sort_order)
    )
    model = db.scalars(model_stmt).first()
    if model is None:
        raise HTTPException(status_code=400, detail="No model available")

    processed = 0
    for chunk in chunks:
        content = await llm.call(
            user_id=writer.id,
            project_id=project.id,
            agent_name="chunk_topic_extractor",
            scenario="chunk_topic",
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "你是学术文本主题提取专家。阅读以下文本片段，用一句话（不超过80字）总结其核心主题。"
                        "只输出主题摘要，不要任何多余文字。"
                    ),
                },
                {"role": "user", "content": chunk.content[:2000]},
            ],
        )
        topic = content.strip()[:500] if content else None
        chunk.topic_summary = topic
        processed += 1

    db.commit()
    return {"project_id": str(project_id), "processed": processed}
