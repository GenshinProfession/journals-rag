from dataclasses import dataclass
from typing import Any

import httpx

from app.config import Settings


@dataclass(frozen=True)
class GatewayBalanceResult:
    query_url: str
    ok: bool
    balance: str | None
    raw: Any
    error: str | None = None


class GatewayBalanceService:
    """Best-effort adapter for free API-key balance query pages."""

    def __init__(self, settings: Settings):
        self.settings = settings

    def configured_keys(self) -> dict[str, str]:
        out: dict[str, str] = {}
        if self.settings.ai_gateway_api_key:
            out["api_key"] = self.settings.ai_gateway_api_key
        if self.settings.ai_gateway_chat_api_key:
            out["chat_api_key"] = self.settings.ai_gateway_chat_api_key
        out.update(self.settings.ai_gateway_named_api_keys)
        return {k: v for k, v in out.items() if v}

    async def query_key(self, api_key: str) -> GatewayBalanceResult:
        last_error: str | None = None
        for url in self.settings.ai_gateway_balance_query_urls:
            try:
                result = await self._query_one(url, api_key)
            except Exception as exc:  # noqa: BLE001
                last_error = str(exc)
                continue
            if result.ok:
                return result
            last_error = result.error
        return GatewayBalanceResult(
            query_url=",".join(self.settings.ai_gateway_balance_query_urls),
            ok=False,
            balance=None,
            raw=None,
            error=last_error or "all query endpoints failed",
        )

    async def _query_one(self, url: str, api_key: str) -> GatewayBalanceResult:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            attempts = [
                ("json", lambda: client.post(url, json={"api_key": api_key, "key": api_key})),
                ("form", lambda: client.post(url, data={"api_key": api_key, "key": api_key})),
                ("query", lambda: client.get(url, params={"api_key": api_key, "key": api_key})),
            ]
            last_text = ""
            for _name, call in attempts:
                response = await call()
                if response.status_code >= 500:
                    continue
                ct = response.headers.get("content-type", "")
                raw: Any
                if "application/json" in ct:
                    raw = response.json()
                    balance = self._extract_balance(raw)
                    return GatewayBalanceResult(
                        query_url=url,
                        ok=response.is_success,
                        balance=balance,
                        raw=raw,
                        error=None if response.is_success else response.text[:500],
                    )
                last_text = response.text
                if response.is_success and api_key[:8] not in last_text:
                    balance = self._extract_balance(last_text)
                    return GatewayBalanceResult(query_url=url, ok=True, balance=balance, raw=last_text[:4000])
            return GatewayBalanceResult(
                query_url=url,
                ok=False,
                balance=None,
                raw=last_text[:4000],
                error="query endpoint did not return a usable response",
            )

    def _extract_balance(self, raw: Any) -> str | None:
        if isinstance(raw, dict):
            for key in ("balance", "quota", "remain", "remaining", "amount", "credit", "余额", "额度"):
                if key in raw and raw[key] is not None:
                    return str(raw[key])
            for value in raw.values():
                nested = self._extract_balance(value)
                if nested is not None:
                    return nested
        if isinstance(raw, list):
            for item in raw:
                nested = self._extract_balance(item)
                if nested is not None:
                    return nested
        if isinstance(raw, str):
            for label in ("余额", "额度", "balance", "remaining", "remain", "quota"):
                idx = raw.lower().find(label.lower())
                if idx >= 0:
                    return raw[idx : idx + 120].strip()
        return None
