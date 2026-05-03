from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import router
from app.bootstrap import ensure_bootstrap_admin, ensure_database_schema, ensure_demo_model
from app.config import get_settings
from app.services.billing_service import InsufficientBalanceError


@asynccontextmanager
async def lifespan(_app: FastAPI):
    ensure_database_schema()
    ensure_bootstrap_admin()
    ensure_demo_model()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.exception_handler(InsufficientBalanceError)
    async def insufficient_balance_handler(
        _request: Request, exc: InsufficientBalanceError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=402,
            content={
                "detail": "Insufficient wallet balance",
                "balance_cents": exc.balance_cents,
                "required_cents": exc.required_cents,
            },
        )

    app.include_router(router, prefix=settings.api_prefix)
    return app


app = create_app()
