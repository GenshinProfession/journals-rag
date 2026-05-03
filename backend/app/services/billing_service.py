from uuid import UUID

from sqlalchemy.orm import Session

from app.models.billing import AccountWallet, RechargeRecord, WalletLedger


class InsufficientBalanceError(Exception):
    """Wallet balance lower than billed amount."""

    def __init__(self, *, balance_cents: int, required_cents: int):
        super().__init__(f"balance {balance_cents} < required {required_cents}")
        self.balance_cents = balance_cents
        self.required_cents = required_cents


class BillingService:
    def __init__(self, db: Session):
        self.db = db

    def recharge(
        self,
        user_id: UUID,
        admin_id: UUID,
        amount_cents: int,
        note: str | None = None,
        *,
        commit: bool = True,
    ) -> None:
        wallet = self.db.get(AccountWallet, user_id)
        if wallet is None:
            wallet = AccountWallet(user_id=user_id)
            self.db.add(wallet)

        wallet.balance_cents += amount_cents
        wallet.total_recharged_cents += amount_cents
        self.db.add(RechargeRecord(user_id=user_id, admin_id=admin_id, amount_cents=amount_cents, note=note))
        self.db.add(
            WalletLedger(
                user_id=user_id,
                type="recharge",
                amount_cents=amount_cents,
                balance_after_cents=wallet.balance_cents,
                note=note,
            )
        )
        if commit:
            self.db.commit()

    def reserve_balance(
        self,
        user_id: UUID,
        amount_cents: int,
        *,
        commit: bool = True,
    ) -> None:
        """Move liquidity from balance into frozen_cents (pre-authorize a relay call)."""
        if amount_cents <= 0:
            return
        wallet = self.db.get(AccountWallet, user_id)
        bal = wallet.balance_cents if wallet else 0
        if wallet is None or bal < amount_cents:
            raise InsufficientBalanceError(balance_cents=bal, required_cents=amount_cents)

        wallet.balance_cents -= amount_cents
        wallet.frozen_cents += amount_cents
        if commit:
            self.db.commit()

    def cancel_reserve(self, user_id: UUID, amount_cents: int, *, commit: bool = True) -> None:
        """Return a failed call's reservation from frozen back to balance."""
        if amount_cents <= 0:
            return
        wallet = self.db.get(AccountWallet, user_id)
        if wallet is None:
            return
        undo = min(amount_cents, wallet.frozen_cents)
        wallet.frozen_cents -= undo
        wallet.balance_cents += undo
        if commit:
            self.db.commit()

    def settle_reserved_consumption(
        self,
        user_id: UUID,
        reserved_cents: int,
        actual_cents: int,
        *,
        usage_id: UUID | None = None,
        note: str | None = None,
        commit: bool = True,
    ) -> None:
        """Release frozen reservation, then deduct the actual metered cost from balance."""
        if reserved_cents < 0 or actual_cents < 0:
            raise ValueError("reserved and actual consumption must be non-negative")
        wallet = self.db.get(AccountWallet, user_id)
        if wallet is None:
            raise InsufficientBalanceError(balance_cents=0, required_cents=actual_cents)

        if reserved_cents > 0 and wallet.frozen_cents < reserved_cents:
            raise ValueError("frozen balance lower than reserved amount")

        projected_balance_after_release = wallet.balance_cents + reserved_cents
        if actual_cents > projected_balance_after_release:
            raise InsufficientBalanceError(
                balance_cents=projected_balance_after_release,
                required_cents=actual_cents,
            )

        if reserved_cents > 0:
            wallet.frozen_cents -= reserved_cents
            wallet.balance_cents += reserved_cents

        if actual_cents == 0:
            if commit:
                self.db.commit()
            return

        if wallet.balance_cents < actual_cents:
            raise InsufficientBalanceError(balance_cents=wallet.balance_cents, required_cents=actual_cents)

        wallet.balance_cents -= actual_cents
        wallet.total_consumed_cents += actual_cents
        self.db.add(
            WalletLedger(
                user_id=user_id,
                type="consume",
                amount_cents=-actual_cents,
                balance_after_cents=wallet.balance_cents,
                related_usage_id=usage_id,
                note=note,
            )
        )
        if commit:
            self.db.commit()

    def consume(
        self,
        user_id: UUID,
        amount_cents: int,
        *,
        usage_id: UUID | None = None,
        note: str | None = None,
        commit: bool = True,
    ) -> None:
        """Deduct balance after relay usage accounting; negative amounts are rejected."""
        if amount_cents < 0:
            raise ValueError("consume amount cannot be negative")
        if amount_cents == 0:
            return
        wallet = self.db.get(AccountWallet, user_id)
        bal = wallet.balance_cents if wallet else 0
        if wallet is None or bal < amount_cents:
            raise InsufficientBalanceError(balance_cents=bal, required_cents=amount_cents)

        wallet.balance_cents -= amount_cents
        wallet.total_consumed_cents += amount_cents

        self.db.add(
            WalletLedger(
                user_id=user_id,
                type="consume",
                amount_cents=-amount_cents,
                balance_after_cents=wallet.balance_cents,
                related_usage_id=usage_id,
                note=note,
            )
        )
        if commit:
            self.db.commit()

    def adjust_balance(
        self,
        user_id: UUID,
        amount_cents: int,
        *,
        note: str,
        commit: bool = True,
    ) -> None:
        if amount_cents == 0:
            raise ValueError("adjustment amount cannot be zero")
        wallet = self.db.get(AccountWallet, user_id)
        if wallet is None:
            wallet = AccountWallet(user_id=user_id)
            self.db.add(wallet)
            self.db.flush()

        new_balance = wallet.balance_cents + amount_cents
        if new_balance < 0:
            raise InsufficientBalanceError(
                balance_cents=wallet.balance_cents,
                required_cents=abs(amount_cents),
            )

        wallet.balance_cents = new_balance
        self.db.add(
            WalletLedger(
                user_id=user_id,
                type="adjustment",
                amount_cents=amount_cents,
                balance_after_cents=wallet.balance_cents,
                note=note,
            )
        )
        if commit:
            self.db.commit()

    def calculate_cost_cents(
        self,
        input_tokens: int,
        output_tokens: int,
        input_price_per_1k_cents: int,
        output_price_per_1k_cents: int,
    ) -> int:
        input_cost = (input_tokens * input_price_per_1k_cents + 999) // 1000
        output_cost = (output_tokens * output_price_per_1k_cents + 999) // 1000
        return input_cost + output_cost
