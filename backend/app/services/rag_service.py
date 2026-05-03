import hashlib
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import Settings
from app.models.rag import Literature, RAGChunk, RAGDocument
from app.services.embedding_service import EmbeddingService
from app.services.literature_text import resolve_literature_text
from app.services.text_chunk import chunk_plain_text


class RAGService:
    """Draft chunking + embedding ingest for project-scoped RAG."""

    def __init__(self, db: Session, settings: Settings):
        self.db = db
        self.settings = settings

    def _purge_drafts_for_literature(self, literature_id: UUID) -> None:
        stmt = select(RAGDocument.id).where(
            RAGDocument.literature_id == literature_id,
            RAGDocument.chunking_status == "draft",
        )
        doc_ids = list(self.db.scalars(stmt).all())
        if not doc_ids:
            return
        self.db.execute(delete(RAGChunk).where(RAGChunk.document_id.in_(doc_ids)))
        self.db.execute(delete(RAGDocument).where(RAGDocument.id.in_(doc_ids)))

    def rebuild_draft_document(
        self,
        *,
        literature: Literature,
        project_id: UUID,
        writer_id: UUID,
        chunk_char_limit: int = 1800,
        overlap: int = 200,
        text_override: str | None = None,
    ) -> tuple[RAGDocument, list[RAGChunk]]:
        source = (
            text_override.strip()
            if text_override
            else resolve_literature_text(literature, self.settings.upload_root)
        )
        if not source:
            raise ValueError("literature_has_no_extractable_text")

        digest = hashlib.sha256(source.encode("utf-8")).hexdigest()
        self._purge_drafts_for_literature(literature.id)

        doc = RAGDocument(
            project_id=project_id,
            literature_id=literature.id,
            source_type="literature_upload",
            source_path=literature.file_path or "(inline)",
            text_hash=digest,
            chunking_status="draft",
            created_by=writer_id,
        )
        self.db.add(doc)
        self.db.flush()

        parts = chunk_plain_text(source, chunk_size=chunk_char_limit, overlap=overlap)
        chunks: list[RAGChunk] = []
        for idx, chunk_text in enumerate(parts):
            chunk = RAGChunk(
                document_id=doc.id,
                project_id=project_id,
                literature_id=literature.id,
                chunk_index=idx,
                content=chunk_text,
                embedding=None,
                status="draft",
            )
            self.db.add(chunk)
            chunks.append(chunk)

        literature.rag_status = "chunks_preview"
        self.db.commit()
        self.db.refresh(doc)
        for c in chunks:
            self.db.refresh(c)
        return doc, chunks

    async def embed_chunks(self, embedding: EmbeddingService, chunks: list[RAGChunk]) -> None:
        if not chunks:
            return
        vectors = await embedding.embed_many([c.content for c in chunks])
        for ch, vec in zip(chunks, vectors, strict=True):
            ch.embedding = vec

    async def finalize_confirmation(
        self,
        embedding: EmbeddingService,
        *,
        literature: Literature,
        document: RAGDocument,
        chunk_ids: list[UUID],
    ) -> int:
        if document.project_id != literature.project_id:
            raise ValueError("document_project_mismatch")
        if document.literature_id != literature.id:
            raise ValueError("document_literature_mismatch")

        want = set(chunk_ids)
        stmt = select(RAGChunk).where(RAGChunk.document_id == document.id)
        chunks = [c for c in self.db.scalars(stmt).all() if c.id in want]
        if not chunks:
            return 0

        need_embeddings = [c for c in chunks if c.embedding is None]
        if need_embeddings:
            await self.embed_chunks(embedding, need_embeddings)

        for ch in chunks:
            ch.status = "confirmed"

        document.chunking_status = "confirmed"
        literature.rag_status = "indexed"
        self.db.commit()
        return len(chunks)
