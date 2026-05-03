from fastapi import APIRouter
from sqlalchemy import select

from app.deps import DbSessionDep, WriterUserDep
from app.models.billing import AccountWallet, WalletLedger
from app.schemas.billing import MyWalletResponse, WalletLedgerResponse

router = APIRouter()


@router.get("", response_model=MyWalletResponse)
def current_wallet(writer: WriterUserDep, db: DbSessionDep) -> MyWalletResponse:
    wallet = db.get(AccountWallet, writer.id)
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
    stmt = (
        select(WalletLedger)
        .where(WalletLedger.user_id == writer.id)
        .order_by(WalletLedger.created_at.desc())
        .limit(200)
    )
    return list(db.scalars(stmt).all())
