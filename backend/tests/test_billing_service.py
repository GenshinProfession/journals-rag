from app.services.billing_service import BillingService


def test_calculate_cost_cents_rounds_each_side_up() -> None:
    service = BillingService(db=None)  # type: ignore[arg-type]

    assert service.calculate_cost_cents(
        input_tokens=1001,
        output_tokens=1,
        input_price_per_1k_cents=3,
        output_price_per_1k_cents=5,
    ) == 11


def test_calculate_cost_cents_zero_usage_is_free() -> None:
    service = BillingService(db=None)  # type: ignore[arg-type]

    assert service.calculate_cost_cents(
        input_tokens=0,
        output_tokens=0,
        input_price_per_1k_cents=3,
        output_price_per_1k_cents=5,
    ) == 0
