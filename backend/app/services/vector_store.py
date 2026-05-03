from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.rag import RAGChunk


class VectorStore:
    """Project-scoped pgvector search wrapper."""

    def __init__(self, db: Session):
        self.db = db

    def search(self, project_id: UUID, embedding: list[float], limit: int = 8) -> list[RAGChunk]:
        statement = (
            select(RAGChunk)
            .where(
                RAGChunk.project_id == project_id,
                RAGChunk.status == "confirmed",
                RAGChunk.embedding.isnot(None),
            )
            .order_by(RAGChunk.embedding.cosine_distance(embedding))
            .limit(limit)
        )
        return list(self.db.scalars(statement))
