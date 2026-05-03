from sqlalchemy import select, text

from app.config import get_settings
from app.db import Base, SessionLocal, engine
import app.models  # noqa: F401
from app.models.model_catalog import ModelCatalog
from app.models.user import User
from app.security import hash_password


def ensure_database_schema() -> None:
    settings = get_settings()
    if not settings.bootstrap_create_schema:
        return
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    Base.metadata.create_all(bind=engine)


def ensure_bootstrap_admin() -> None:
    settings = get_settings()
    if not settings.bootstrap_admin_username or not settings.bootstrap_admin_password:
        return
    with SessionLocal() as db:
        existing = db.scalar(select(User).where(User.username == settings.bootstrap_admin_username))
        if existing is not None:
            return
        admin = User(
            username=settings.bootstrap_admin_username,
            password_hash=hash_password(settings.bootstrap_admin_password),
            role="admin",
            is_active=True,
            created_by=None,
        )
        db.add(admin)
        db.commit()


def ensure_demo_model() -> None:
    settings = get_settings()
    if not settings.bootstrap_demo_model:
        return
    scenarios = [
        "reference_review",
        "rag",
        "outline",
        "chapter_write",
        "chapter_review",
        "chapter_rewrite",
    ]
    demo_models = [
        {
            "display_name": "DeepSeek V4 Pro",
            "provider_model": "deepseek-v4-pro",
            "endpoint_type": "openai_chat",
            "context_window": 128000,
            "sort_order": 10,
        },
        {
            "display_name": "GPT-5.5",
            "provider_model": "gpt-5.5",
            "endpoint_type": "openai_chat",
            "context_window": 256000,
            "sort_order": 20,
        },
        {
            "display_name": "Claude Opus 4.7",
            "provider_model": "claude-opus-4-7",
            "endpoint_type": "openai_chat",
            "context_window": 1_000_000,
            "sort_order": 30,
        },
        {
            "display_name": "Gemini 3.1 Pro Preview",
            "provider_model": "gemini-3.1-pro-preview",
            "endpoint_type": "gemini_generate_content",
            "context_window": 1_000_000,
            "sort_order": 40,
        },
    ]
    with SessionLocal() as db:
        existing = db.scalar(select(ModelCatalog.id).limit(1))
        if existing is not None:
            return
        for item in demo_models:
            db.add(
                ModelCatalog(
                    display_name=item["display_name"],
                    provider="yunwu",
                    provider_model=item["provider_model"],
                    endpoint_type=item["endpoint_type"],
                    api_key_name=None,
                    context_window=item["context_window"],
                    input_price_per_1k_cents=0,
                    output_price_per_1k_cents=0,
                    enabled=True,
                    allowed_scenarios=scenarios,
                    sort_order=item["sort_order"],
                )
            )
        db.add(
            ModelCatalog(
                display_name="Dev Relay Model",
                provider="ai_gateway",
                provider_model="dev-model",
                endpoint_type="openai_chat",
                api_key_name=None,
                context_window=128000,
                input_price_per_1k_cents=0,
                output_price_per_1k_cents=0,
                enabled=True,
                allowed_scenarios=scenarios,
                sort_order=0,
            )
        )
        db.commit()
