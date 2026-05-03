from uuid import UUID

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.deps import (
    DbSessionDep,
    EmbeddingServiceDep,
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
    chunks = store.search(project_id=project_id, embedding=qvec, limit=payload.limit)
    return {
        "project_id": str(project_id),
        "items": [
            {
                "id": str(ch.id),
                "literature_id": str(ch.literature_id) if ch.literature_id else None,
                "chunk_index": ch.chunk_index,
                "text": ch.content[:800],
                "tokens": len(ch.content) // 4,
            }
            for ch in chunks
        ],
    }
