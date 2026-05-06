from functools import lru_cache

from pydantic import AnyHttpUrl, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Journals RAG"
    environment: str = "development"
    api_prefix: str = "/api"

    database_url: str = Field(
        default="postgresql+psycopg://journals:journer@localhost:5432/journals_rag"
    )
    redis_url: str = "redis://localhost:6379/0"

    jwt_secret_key: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24
    login_rate_limit_attempts: int = 10
    login_rate_limit_window_seconds: int = 60

    ai_gateway_base_url: AnyHttpUrl | None = None
    ai_gateway_api_key: str | None = None
    ai_gateway_chat_api_key: str | None = Field(
        default=None,
        description="Optional key for OpenAI-compatible chat; falls back to ai_gateway_api_key.",
    )
    ai_gateway_named_api_keys: dict[str, str] = Field(
        default_factory=dict,
        description="Optional named keys; model_catalog.api_key_name can select one.",
    )
    ai_gateway_balance_query_urls: list[str] = [
        "https://chaxun.wlai.vip/",
        "https://cx.tpkcur.click/",
    ]

    billing_reserve_ceiling_cents: int = Field(
        default=50_000,
        description="Max wallet balance frozen (cents) for a single relay chat call reserve.",
    )

    embedding_model: str = "text-embedding-3-small"
    embedding_dimensions: int = 1536

    upload_root: str = "uploads"
    upload_max_bytes: int = 100 * 1024 * 1024
    upload_allowed_extensions: list[str] = [".pdf", ".txt", ".md", ".text"]
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:5174"]

    bootstrap_admin_username: str | None = None
    bootstrap_admin_password: str | None = None

    bootstrap_create_schema: bool = Field(
        default=True,
        description="If false, rely on Alembic migrations instead of CREATE TABLE at startup.",
    )
    bootstrap_demo_model: bool = Field(
        default=False,
        description="Create a development model catalog row when no models exist.",
    )

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


@lru_cache
def get_settings() -> Settings:
    return Settings()
