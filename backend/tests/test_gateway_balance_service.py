from app.config import Settings
from app.services.gateway_balance_service import GatewayBalanceService


def test_gateway_balance_extracts_common_json_fields() -> None:
    service = GatewayBalanceService(Settings())

    assert service._extract_balance({"balance": 12.5}) == "12.5"
    assert service._extract_balance({"data": {"remaining": "3.2"}}) == "3.2"


def test_gateway_balance_extracts_text_label() -> None:
    service = GatewayBalanceService(Settings())

    assert service._extract_balance("当前额度余额：88.00 元，感谢使用") is not None


def test_gateway_balance_configured_keys_masks_empty_values() -> None:
    service = GatewayBalanceService(
        Settings(
            ai_gateway_api_key="api",
            ai_gateway_chat_api_key="",
            ai_gateway_named_api_keys={"a": "key-a", "b": ""},
        )
    )

    assert service.configured_keys() == {"api_key": "api", "a": "key-a"}
