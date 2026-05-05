from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import select

from app.config import get_settings
from app.deps import CurrentUserDep, DbSessionDep
from app.models.user import User
from app.schemas.auth import CurrentUserResponse, LoginRequest, TokenResponse
from app.security import create_access_token, verify_password
from app.services.rate_limit import login_limiter

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
def login(request: Request, db: DbSessionDep, payload: LoginRequest) -> TokenResponse:
    settings = get_settings()
    client_host = request.client.host if request.client else "unknown"
    limit_key = f"{client_host}:{payload.username}"
    if not login_limiter.allow(
        limit_key,
        max_attempts=settings.login_rate_limit_attempts,
        window_seconds=settings.login_rate_limit_window_seconds,
    ):
        raise HTTPException(status_code=429, detail="Too many login attempts")

    user = db.scalar(select(User).where(User.username == payload.username))
    if user is None or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token(settings=settings, user_id=user.id)
    return TokenResponse(access_token=token)


SUPER_ADMIN_MENUS = [
    "dashboard", "orgs", "billing", "usage", "models", "schools", "universities",
]
ORG_ADMIN_MENUS = [
    "dashboard", "writers", "usage", "schools", "universities",
]


@router.get("/me", response_model=CurrentUserResponse)
def me(current: CurrentUserDep) -> CurrentUserResponse:
    if current.role in ("super_admin", "admin"):
        menus = SUPER_ADMIN_MENUS
    elif current.role == "org_admin":
        menus = ORG_ADMIN_MENUS
    else:
        menus = []
    return CurrentUserResponse(
        id=current.id,
        username=current.username,
        nickname=current.nickname,
        role=current.role,
        org_id=getattr(current, "org_id", None),
        allowed_menus=menus,
    )
