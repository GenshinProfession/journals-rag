from collections.abc import Generator
from typing import Annotated

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.models.user import User
from app.security import decode_access_token_subject
from app.services.embedding_service import EmbeddingService
from app.services.llm_service import LLMService
from app.services.provider_gateway import ProviderGatewayService

_bearer_optional = HTTPBearer(auto_error=False)
_bearer_required = HTTPBearer(auto_error=True)


def get_db_session() -> Generator[Session, None, None]:
    yield from get_db()


DbSessionDep = Annotated[Session, Depends(get_db_session)]


def _user_from_token(db: Session, token: str) -> User | None:
    settings = get_settings()
    try:
        user_id = decode_access_token_subject(settings, token)
    except (JWTError, ValueError):
        return None
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        return None
    return user


def get_optional_user(
    db: DbSessionDep,
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer_optional),
) -> User | None:
    if creds is None or creds.scheme.lower() != "bearer":
        return None
    return _user_from_token(db, creds.credentials)


def require_user(
    db: DbSessionDep,
    creds: Annotated[HTTPAuthorizationCredentials, Depends(_bearer_required)],
) -> User:
    if creds.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Missing bearer token")
    user = _user_from_token(db, creds.credentials)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return user


CurrentUserDep = Annotated[User, Depends(require_user)]


def require_admin(user: CurrentUserDep) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Administrator role required")
    return user


def require_writer(user: CurrentUserDep) -> User:
    if user.role != "writer":
        raise HTTPException(status_code=403, detail="Writer role required")
    return user


AdminUserDep = Annotated[User, Depends(require_admin)]
WriterUserDep = Annotated[User, Depends(require_writer)]


def inject_settings() -> Settings:
    return get_settings()


SettingsDep = Annotated[Settings, Depends(inject_settings)]


def get_provider_gateway(settings: SettingsDep) -> ProviderGatewayService:
    return ProviderGatewayService(settings)


ProviderGatewayDep = Annotated[ProviderGatewayService, Depends(get_provider_gateway)]


def get_llm_service(
    db: DbSessionDep,
    gateway: ProviderGatewayDep,
    settings: SettingsDep,
) -> LLMService:
    return LLMService(db, gateway, settings)


LLMServiceDep = Annotated[LLMService, Depends(get_llm_service)]


def get_embedding_service(
    settings: SettingsDep,
    gateway: ProviderGatewayDep,
) -> EmbeddingService:
    return EmbeddingService(settings, gateway)


EmbeddingServiceDep = Annotated[EmbeddingService, Depends(get_embedding_service)]
