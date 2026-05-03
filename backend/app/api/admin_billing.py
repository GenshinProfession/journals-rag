from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from sqlalchemy import select

from app.deps import AdminUserDep, DbSessionDep, ProviderGatewayDep
from app.models.ai_usage import AIUsageRecord
from app.models.billing import AccountWallet, WalletLedger
from app.models.model_catalog import ModelCatalog
from app.models.user import User
from app.schemas.billing import (
    AIUsageResponse,
    GatewayBalanceQueryRequest,
    RechargeRequest,
    UsageReconcileRequest,
    WalletAdjustmentRequest,
    WalletLedgerResponse,
    WalletWithUserResponse,
)
from app.services.billing_service import BillingService, InsufficientBalanceError
from app.services.gateway_balance_service import GatewayBalanceService

router = APIRouter()


def _mask_key(key: str) -> str:
    if len(key) <= 12:
        return "***"
    return f"{key[:6]}...{key[-4:]}"


@router.get("/wallets", response_model=list[WalletWithUserResponse])
def list_wallets(_admin: AdminUserDep, db: DbSessionDep) -> list[WalletWithUserResponse]:
    rows = db.execute(
        select(AccountWallet, User.username)
        .join(User, User.id == AccountWallet.user_id)
        .order_by(AccountWallet.updated_at.desc())
    ).all()
    return [
        WalletWithUserResponse(
            user_id=wallet.user_id,
            username=username,
            balance_cents=wallet.balance_cents,
            frozen_cents=wallet.frozen_cents,
            total_recharged_cents=wallet.total_recharged_cents,
            total_consumed_cents=wallet.total_consumed_cents,
        )
        for wallet, username in rows
    ]


@router.post("/recharge")
def recharge(
    admin: AdminUserDep, db: DbSessionDep, payload: RechargeRequest
) -> dict[str, object]:
    target = db.get(User, payload.user_id)
    if target is None or target.role != "writer":
        raise HTTPException(status_code=400, detail="Recharge target must be an active writer account")
    BillingService(db).recharge(user_id=payload.user_id, admin_id=admin.id, amount_cents=payload.amount_cents, note=payload.note)
    wallet = db.get(AccountWallet, payload.user_id)
    return {
        "status": "recharged",
        "user_id": payload.user_id,
        "balance_cents": wallet.balance_cents if wallet else 0,
        "amount_cents": payload.amount_cents,
    }


@router.post("/adjust")
def adjust_wallet(
    _admin: AdminUserDep, db: DbSessionDep, payload: WalletAdjustmentRequest
) -> dict[str, object]:
    target = db.get(User, payload.user_id)
    if target is None or target.role != "writer":
        raise HTTPException(status_code=400, detail="Adjustment target must be a writer account")
    try:
        BillingService(db).adjust_balance(
            user_id=payload.user_id,
            amount_cents=payload.amount_cents,
            note=payload.note,
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    except InsufficientBalanceError as err:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Adjustment would make balance negative",
                "balance_cents": err.balance_cents,
                "required_cents": err.required_cents,
            },
        ) from err
    wallet = db.get(AccountWallet, payload.user_id)
    return {
        "status": "adjusted",
        "user_id": payload.user_id,
        "balance_cents": wallet.balance_cents if wallet else 0,
        "amount_cents": payload.amount_cents,
    }


@router.get("/ledger", response_model=list[WalletLedgerResponse])
def ledger_list(
    _admin: AdminUserDep,
    db: DbSessionDep,
    user_id: UUID | None = Query(default=None),
    limit: int = Query(default=200, le=500),
) -> list[WalletLedger]:
    stmt = select(WalletLedger).order_by(WalletLedger.created_at.desc()).limit(limit)
    if user_id is not None:
        stmt = stmt.where(WalletLedger.user_id == user_id)
    return list(db.scalars(stmt).all())


@router.get("/usage", response_model=list[AIUsageResponse])
def usage_list(
    _admin: AdminUserDep,
    db: DbSessionDep,
    user_id: UUID | None = Query(default=None),
    limit: int = Query(default=200, le=1000),
) -> list[AIUsageRecord]:
    stmt = select(AIUsageRecord).order_by(AIUsageRecord.created_at.desc()).limit(limit)
    if user_id is not None:
        stmt = stmt.where(AIUsageRecord.user_id == user_id)
    return list(db.scalars(stmt).all())


@router.post("/usage/reconcile")
async def reconcile_usage(
    _admin: AdminUserDep,
    db: DbSessionDep,
    gateway: ProviderGatewayDep,
    payload: UsageReconcileRequest,
) -> dict[str, object]:
    stmt = select(AIUsageRecord).where(AIUsageRecord.provider_request_id.isnot(None))
    if payload.user_id is not None:
        stmt = stmt.where(AIUsageRecord.user_id == payload.user_id)
    stmt = stmt.order_by(AIUsageRecord.created_at.desc()).limit(payload.limit)

    rows = list(db.scalars(stmt).all())
    items: list[dict[str, object]] = []
    changed = 0
    billing = BillingService(db)
    for usage in rows:
        if not usage.provider_request_id:
            continue
        model = db.get(ModelCatalog, usage.model_id) if usage.model_id else None
        fetched = await gateway.fetch_usage(usage.provider_request_id)
        expected_cost = (
            billing.calculate_cost_cents(
                fetched.input_tokens,
                fetched.output_tokens,
                model.input_price_per_1k_cents,
                model.output_price_per_1k_cents,
            )
            if model
            else usage.cost_cents
        )
        diff = {
            "usage_id": str(usage.id),
            "provider_request_id": usage.provider_request_id,
            "old_input_tokens": usage.input_tokens,
            "new_input_tokens": fetched.input_tokens,
            "old_output_tokens": usage.output_tokens,
            "new_output_tokens": fetched.output_tokens,
            "old_cost_cents": usage.cost_cents,
            "new_cost_cents": expected_cost,
            "changed": (
                usage.input_tokens != fetched.input_tokens
                or usage.output_tokens != fetched.output_tokens
                or usage.cost_cents != expected_cost
            ),
        }
        if diff["changed"]:
            changed += 1
            if not payload.dry_run:
                usage.input_tokens = fetched.input_tokens
                usage.output_tokens = fetched.output_tokens
                usage.cost_cents = expected_cost
                db.add(usage)
        items.append(diff)

    if not payload.dry_run:
        db.commit()

    return {
        "status": "dry_run" if payload.dry_run else "updated",
        "checked": len(items),
        "changed": changed,
        "items": items,
    }


@router.post("/gateway-balance")
async def query_gateway_balance(
    _admin: AdminUserDep,
    gateway: ProviderGatewayDep,
    payload: GatewayBalanceQueryRequest,
) -> dict[str, object]:
    service = GatewayBalanceService(gateway.settings)
    keys = service.configured_keys()
    if payload.api_key:
        selected = {"manual": payload.api_key}
    elif payload.api_key_name:
        if payload.api_key_name not in keys:
            raise HTTPException(status_code=404, detail="Configured key name not found")
        selected = {payload.api_key_name: keys[payload.api_key_name]}
    else:
        selected = keys
    if not selected:
        raise HTTPException(status_code=400, detail="No API keys configured")

    items = []
    for name, key in selected.items():
        result = await service.query_key(key)
        items.append(
            {
                "name": name,
                "masked_key": _mask_key(key),
                "query_url": result.query_url,
                "ok": result.ok,
                "balance": result.balance,
                "raw": result.raw,
                "error": result.error,
            }
        )
    return {"items": items}
