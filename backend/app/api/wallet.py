from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select

from app.deps import DbSessionDep, WriterUserDep
from app.models.billing import AccountWallet, WalletLedger
from app.schemas.billing import MyWalletResponse, WalletLedgerResponse

router = APIRouter()


def _wallet_owner_id(writer) -> UUID:
    """Writer uses org_admin's wallet; fallback to own id."""
    if writer.org_id is not None:
        return writer.org_id
    return writer.id


@router.get("", response_model=MyWalletResponse)
def current_wallet(writer: WriterUserDep, db: DbSessionDep) -> MyWalletResponse:
    owner_id = _wallet_owner_id(writer)
    wallet = db.get(AccountWallet, owner_id)
    if wallet is None:
        return MyWalletResponse(
            balance_cents=0, frozen_cents=0, total_recharged_cents=0, total_consumed_cents=0
        )
    return MyWalletResponse(
        balance_cents=wallet.balance_cents,
        frozen_cents=wallet.frozen_cents,
        total_recharged_cents=wallet.total_recharged_cents,
        total_consumed_cents=wallet.total_consumed_cents,
    )


@router.get("/ledger", response_model=list[WalletLedgerResponse])
def current_ledger(writer: WriterUserDep, db: DbSessionDep) -> list[WalletLedger]:
    owner_id = _wallet_owner_id(writer)
    stmt = (
        select(WalletLedger)
        .where(WalletLedger.user_id == owner_id)
        .order_by(WalletLedger.created_at.desc())
        .limit(200)
    )
    return list(db.scalars(stmt).all())
