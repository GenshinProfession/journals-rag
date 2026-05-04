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

    def search_with_scores(
        self,
        project_id: UUID,
        embedding: list[float],
        limit: int = 8,
    ) -> list[tuple[RAGChunk, float]]:
        """Return (chunk, similarity) pairs. Similarity = 1 - cosine_distance."""
        dist_col = RAGChunk.embedding.cosine_distance(embedding).label("distance")
        statement = (
            select(RAGChunk, dist_col)
            .where(
                RAGChunk.project_id == project_id,
                RAGChunk.status == "confirmed",
                RAGChunk.embedding.isnot(None),
            )
            .order_by(dist_col)
            .limit(limit)
        )
        results: list[tuple[RAGChunk, float]] = []
        for row in self.db.execute(statement).all():
            chunk = row[0]
            distance = float(row[1])
            similarity = max(0.0, 1.0 - distance)
            results.append((chunk, round(similarity, 6)))
        return results

    def fetch_by_ids(self, project_id: UUID, chunk_ids: list[UUID]) -> list[RAGChunk]:
        """Fetch specific confirmed chunks by ID (for manual selection)."""
        if not chunk_ids:
            return []
        statement = (
            select(RAGChunk)
            .where(
                RAGChunk.project_id == project_id,
                RAGChunk.id.in_(chunk_ids),
                RAGChunk.status == "confirmed",
            )
        )
        return list(self.db.scalars(statement))
