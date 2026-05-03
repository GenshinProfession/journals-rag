from app.config import Settings
from app.services.provider_gateway import ProviderGatewayService


class EmbeddingService:
    """Embeddings via the same OpenAI-compatible relay as chat."""

    def __init__(self, settings: Settings, gateway: ProviderGatewayService):
        self.settings = settings
        self.gateway = gateway

    async def embed_many(self, texts: list[str]) -> list[list[float]]:
        return await self.gateway.embed_texts(texts)
