from fastapi import APIRouter
from sqlalchemy import func, select

from app.deps import AdminUserDep, DbSessionDep
from app.models.ai_usage import AIUsageRecord
from app.models.billing import AccountWallet
from app.models.model_catalog import ModelCatalog
from app.models.user import User

router = APIRouter()


@router.get("")
def overview(_admin: AdminUserDep, db: DbSessionDep) -> dict[str, int]:
    writer_count = db.scalar(select(func.count()).select_from(User).where(User.role == "writer")) or 0
    active_writer_count = (
        db.scalar(select(func.count()).select_from(User).where(User.role == "writer", User.is_active.is_(True)))
        or 0
    )
    enabled_model_count = (
        db.scalar(select(func.count()).select_from(ModelCatalog).where(ModelCatalog.enabled.is_(True)))
        or 0
    )
    usage_count = db.scalar(select(func.count()).select_from(AIUsageRecord)) or 0

    balance_cents = db.scalar(select(func.coalesce(func.sum(AccountWallet.balance_cents), 0))) or 0
    frozen_cents = db.scalar(select(func.coalesce(func.sum(AccountWallet.frozen_cents), 0))) or 0
    recharged_cents = (
        db.scalar(select(func.coalesce(func.sum(AccountWallet.total_recharged_cents), 0))) or 0
    )
    consumed_cents = (
        db.scalar(select(func.coalesce(func.sum(AccountWallet.total_consumed_cents), 0))) or 0
    )

    return {
        "writer_count": int(writer_count),
        "active_writer_count": int(active_writer_count),
        "enabled_model_count": int(enabled_model_count),
        "usage_count": int(usage_count),
        "balance_cents": int(balance_cents),
        "frozen_cents": int(frozen_cents),
        "recharged_cents": int(recharged_cents),
        "consumed_cents": int(consumed_cents),
    }
