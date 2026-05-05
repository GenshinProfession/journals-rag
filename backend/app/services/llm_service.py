from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.config import Settings
from app.models.ai_usage import AIUsageRecord
from app.models.billing import AccountWallet
from app.models.model_catalog import ModelCatalog
from app.models.user import User
from app.services.billing_service import BillingService, InsufficientBalanceError
from app.services.provider_gateway import ProviderGatewayService


class LLMService:
    """Model call wrapper that records usage, reserves balance, settles billing."""

    def __init__(self, db: Session, gateway: ProviderGatewayService, settings: Settings):
        self.db = db
        self.gateway = gateway
        self.settings = settings
        self.billing = BillingService(db)

    def _resolve_billing_user(self, user_id: UUID) -> UUID:
        """Writer uses their org_admin's wallet; org_admin/super_admin uses own."""
        user = self.db.get(User, user_id)
        if user and user.role == "writer" and user.org_id is not None:
            return user.org_id
        return user_id

    async def call(
        self,
        user_id: UUID,
        project_id: UUID | None,
        agent_name: str,
        scenario: str,
        model: ModelCatalog,
        messages: list[dict[str, Any]],
    ) -> str:
        billing_user_id = self._resolve_billing_user(user_id)

        usage = AIUsageRecord(
            user_id=user_id,
            project_id=project_id,
            model_id=model.id,
            agent_name=agent_name,
            scenario=scenario,
            status="pending",
        )
        self.db.add(usage)
        self.db.flush()

        wallet = self.db.get(AccountWallet, billing_user_id)
        balance_cents = wallet.balance_cents if wallet else 0
        model_is_billable = model.input_price_per_1k_cents > 0 or model.output_price_per_1k_cents > 0
        if model_is_billable and balance_cents <= 0:
            usage.status = "billing_failed"
            usage.error = "insufficient_balance"
            usage.completed_at = datetime.now(UTC)
            self.db.commit()
            raise InsufficientBalanceError(balance_cents=0, required_cents=1)

        reserved_amount = min(self.settings.billing_reserve_ceiling_cents, balance_cents)

        try:
            if reserved_amount > 0:
                self.billing.reserve_balance(billing_user_id, reserved_amount, commit=False)

            outcome = await self.gateway.chat_completion(
                model.provider_model,
                messages,
                endpoint_type=model.endpoint_type,
                api_key_name=model.api_key_name,
            )

            inp, out = outcome.usage.input_tokens, outcome.usage.output_tokens
            if inp == 0 and out == 0 and self.settings.ai_gateway_base_url is not None:
                fetched = await self.gateway.fetch_usage(outcome.usage.provider_request_id)
                inp, out = fetched.input_tokens, fetched.output_tokens

            cost_cents = self.billing.calculate_cost_cents(
                inp,
                out,
                model.input_price_per_1k_cents,
                model.output_price_per_1k_cents,
            )

            usage.provider_request_id = outcome.request_id or None
            usage.input_tokens = inp
            usage.output_tokens = out
            usage.cost_cents = cost_cents
            usage.completed_at = datetime.now(UTC)

            try:
                self.billing.settle_reserved_consumption(
                    billing_user_id,
                    reserved_amount,
                    cost_cents,
                    usage_id=usage.id,
                    note=f"{agent_name}/{scenario}",
                    commit=False,
                )
                usage.status = "succeeded"
            except InsufficientBalanceError:
                if reserved_amount > 0:
                    self.billing.cancel_reserve(billing_user_id, reserved_amount, commit=False)
                usage.status = "billing_failed"
                usage.error = "insufficient_balance"

            self.db.commit()
            return outcome.content

        except Exception as exc:  # noqa: BLE001
            usage.status = "failed"
            usage.error = str(exc)
            usage.completed_at = datetime.now(UTC)
            if reserved_amount > 0:
                self.billing.cancel_reserve(billing_user_id, reserved_amount, commit=False)
            self.db.commit()
            raise
