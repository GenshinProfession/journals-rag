from app.config import Settings
from app.services.provider_gateway import ProviderGatewayService


def test_gateway_uses_named_key_when_present() -> None:
    settings = Settings(
        ai_gateway_base_url="https://yunwu.example.com",
        ai_gateway_api_key="default-api",
        ai_gateway_chat_api_key="chat-api",
        ai_gateway_named_api_keys={"deepseek": "named-key"},
    )
    service = ProviderGatewayService(settings)

    assert service._chat_headers("deepseek")["Authorization"] == "Bearer named-key"
    assert service._api_headers("deepseek")["Authorization"] == "Bearer named-key"


def test_gateway_chat_key_falls_back_to_chat_then_api_key() -> None:
    with_chat = ProviderGatewayService(
        Settings(
            ai_gateway_base_url="https://yunwu.example.com",
            ai_gateway_api_key="default-api",
            ai_gateway_chat_api_key="chat-api",
        )
    )
    assert with_chat._chat_headers()["Authorization"] == "Bearer chat-api"

    without_chat = ProviderGatewayService(
        Settings(ai_gateway_base_url="https://yunwu.example.com", ai_gateway_api_key="default-api")
    )
    assert without_chat._chat_headers()["Authorization"] == "Bearer default-api"
