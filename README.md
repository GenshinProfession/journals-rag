# Journals RAG

AI-driven thesis generation platform with:

- Admin backend for users, recharge, model catalog, and billing records.
- Writer frontend for projects, reference paper review, RAG ingestion, model selection, and generation.
- FastAPI backend with PostgreSQL, pgvector, Redis, and AI relay billing hooks.

## Development Layout

- `backend/`: FastAPI service, SQLAlchemy models, Alembic setup, services.
- `frontend-admin/`: React admin portal.
- `frontend-writer/`: React writer portal.
- `deploy/`: Docker Compose and Nginx entrypoint templates.
- `implementation-task-plan.md`: phased implementation plan.

## First Run

```bash
cp .env.example .env
docker compose -f deploy/docker-compose.yml up
```

On startup the backend installs dependencies, runs `alembic upgrade head`, starts FastAPI, and creates the optional bootstrap admin if configured.
Compose loads **`.env`** in the repo root (create with `cp .env.example .env`). The helper bats copy `.env.example` → `.env` if missing. For production, keep secrets out of git and inject via your secret manager.
For local smoke tests, `BOOTSTRAP_DEMO_MODEL=true` creates one zero-cost model row if the model catalog is empty.

- Writer frontend: `http://localhost:8080`
- Admin frontend: `http://localhost:8081`
- Backend API: `http://localhost:8000`

## Implemented Flow

- Admin logs in, creates writer accounts, recharges wallets, and manages relay model pricing.
- Admin manages school templates, writer accounts, recharge, and model pricing.
- Writer creates a project with an optional school template, saves or uploads a standard reference paper, runs AI quality review, previews/selects RAG chunks, confirms vector indexing, searches project-scoped RAG, generates outline/chapter drafts, reviews/rewrites chapters, and exports Markdown/LaTeX/Word.
- AI chat calls reserve wallet balance, record relay usage, calculate internal cost from model catalog pricing, then settle or mark billing failure.
- A Celery/Redis worker skeleton is included for migrating long-running AI/RAG operations from inline requests to background jobs.

## Production Notes

- Keep PostgreSQL with `pgvector` enabled and run Alembic migrations before deploy.
- Set `BOOTSTRAP_CREATE_SCHEMA=false` outside local development so schema changes are migration-driven.
- `AI_GATEWAY_BASE_URL` is expected to be OpenAI-compatible for `/v1/chat/completions` and `/v1/embeddings`; `/v1/usage/{request_id}` is used as a fallback when chat responses do not include usage.
- `AI_GATEWAY_CHAT_API_KEY` is optional; chat calls use it when present, otherwise they fall back to `AI_GATEWAY_API_KEY`.
- `AI_GATEWAY_NAMED_API_KEYS` can hold a JSON object for multiple relay keys; set `model_catalog.api_key_name` to select one per model.
- `AI_GATEWAY_BALANCE_QUERY_URLS` defaults to the free key quota query pages `https://chaxun.wlai.vip/` and `https://cx.tpkcur.click/`.
- Model catalog rows include `endpoint_type`: `openai_chat`, `openai_responses`, `gemini_generate_content`, or `anthropic_messages`.
- Gemini image/multimodal generation and Seedream image generation helpers are available in `ProviderGatewayService` for future image workflows.
- Uploads are limited by `UPLOAD_MAX_BYTES` and `UPLOAD_ALLOWED_EXTENSIONS`.
- Run the worker with the compose `worker` service or directly with `celery -A app.worker.celery_app worker --loglevel=INFO`.

## Checks

```bash
python -m compileall backend
docker compose -f deploy/docker-compose.yml config
cd backend && python -m pytest
```

On Windows you can run:

```powershell
.\scripts\smoke.ps1
.\scripts\smoke.ps1 -Build
.\scripts\start.ps1
```

Install the backend dev dependencies first if `pytest` is not available in the current Python environment.
