from uuid import UUID

from pydantic import BaseModel, Field


class RechargeRequest(BaseModel):
    user_id: UUID
    amount_cents: int = Field(gt=0)
    note: str | None = None


class WalletAdjustmentRequest(BaseModel):
    user_id: UUID
    amount_cents: int = Field(description="Positive to add balance, negative to deduct balance")
    note: str = Field(min_length=1, max_length=500)


class UsageReconcileRequest(BaseModel):
    user_id: UUID | None = None
    limit: int = Field(default=100, ge=1, le=1000)
    dry_run: bool = True


class GatewayBalanceQueryRequest(BaseModel):
    api_key_name: str | None = Field(default=None, max_length=120)
    api_key: str | None = Field(default=None, min_length=8, max_length=500)


class WalletWithUserResponse(BaseModel):
    user_id: UUID
    username: str
    balance_cents: int
    frozen_cents: int
    total_recharged_cents: int
    total_consumed_cents: int

    model_config = {"from_attributes": True}


class MyWalletResponse(BaseModel):
    balance_cents: int
    frozen_cents: int
    total_recharged_cents: int
    total_consumed_cents: int


class WalletLedgerResponse(BaseModel):
    id: UUID
    user_id: UUID
    type: str
    amount_cents: int
    balance_after_cents: int
    related_usage_id: UUID | None = None
    note: str | None = None

    model_config = {"from_attributes": True}


class AIUsageResponse(BaseModel):
    id: UUID
    user_id: UUID
    project_id: UUID | None
    model_id: UUID | None
    agent_name: str
    scenario: str
    input_tokens: int
    output_tokens: int
    cost_cents: int
    status: str

    model_config = {"from_attributes": True}
