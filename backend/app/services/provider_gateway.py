from dataclasses import dataclass
from typing import Any

import httpx

from app.config import Settings


@dataclass(frozen=True)
class GatewayUsage:
    provider_request_id: str
    input_tokens: int
    output_tokens: int


@dataclass(frozen=True)
class CompletionOutcome:
    content: str
    request_id: str
    usage: GatewayUsage


@dataclass(frozen=True)
class ImageGenerationOutcome:
    images_b64: list[str]
    request_id: str


class ProviderGatewayService:
    """Single integration point for Yunwu / OpenAI-compatible AI relay."""

    def __init__(self, settings: Settings):
        self.settings = settings

    async def chat_completion(
        self,
        provider_model: str,
        messages: list[dict[str, Any]],
        *,
        endpoint_type: str = "openai_chat",
        api_key_name: str | None = None,
    ) -> CompletionOutcome:
        if self.settings.ai_gateway_base_url is None:
            return CompletionOutcome(
                content="",
                request_id="dev-request",
                usage=GatewayUsage(provider_request_id="dev-request", input_tokens=0, output_tokens=0),
            )

        if endpoint_type == "openai_responses":
            return await self._openai_responses(provider_model, messages, api_key_name=api_key_name)
        if endpoint_type == "gemini_generate_content":
            return await self._gemini_generate_content(provider_model, messages, api_key_name=api_key_name)
        if endpoint_type == "anthropic_messages":
            return await self._anthropic_messages(provider_model, messages, api_key_name=api_key_name)
        return await self._openai_chat_completions(provider_model, messages, api_key_name=api_key_name)

    def _select_key(self, api_key_name: str | None, *, chat: bool) -> str | None:
        if api_key_name and api_key_name in self.settings.ai_gateway_named_api_keys:
            return self.settings.ai_gateway_named_api_keys[api_key_name]
        if chat:
            return self.settings.ai_gateway_chat_api_key or self.settings.ai_gateway_api_key
        return self.settings.ai_gateway_api_key

    def _chat_headers(self, api_key_name: str | None = None) -> dict[str, str]:
        key = self._select_key(api_key_name, chat=True)
        return {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}

    def _api_headers(self, api_key_name: str | None = None) -> dict[str, str]:
        key = self._select_key(api_key_name, chat=False)
        return {
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        }

    async def _openai_chat_completions(
        self,
        provider_model: str,
        messages: list[dict[str, Any]],
        *,
        api_key_name: str | None = None,
    ) -> CompletionOutcome:
        async with httpx.AsyncClient(base_url=str(self.settings.ai_gateway_base_url)) as client:
            response = await client.post(
                "/v1/chat/completions",
                headers=self._chat_headers(api_key_name),
                json={"model": provider_model, "messages": messages},
                timeout=120,
            )
            response.raise_for_status()
            data = response.json()

        content = ""
        choices = data.get("choices") or []
        if choices:
            msg = (choices[0] or {}).get("message") or {}
            content = str(msg.get("content") or "")

        request_id = str(data.get("id") or "")
        usage_block = data.get("usage") or {}
        input_tokens = int(
            usage_block.get("prompt_tokens")
            or usage_block.get("input_tokens")
            or usage_block.get("prompt")
            or 0
        )
        output_tokens = int(
            usage_block.get("completion_tokens")
            or usage_block.get("output_tokens")
            or usage_block.get("completion")
            or 0
        )
        if not request_id:
            request_id = "relay-response"

        return CompletionOutcome(
            content=content,
            request_id=request_id,
            usage=GatewayUsage(
                provider_request_id=request_id,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
            ),
        )

    async def _openai_responses(
        self,
        provider_model: str,
        messages: list[dict[str, Any]],
        *,
        api_key_name: str | None = None,
    ) -> CompletionOutcome:
        input_text = "\n\n".join([f"{m.get('role', 'user')}: {m.get('content', '')}" for m in messages])
        async with httpx.AsyncClient(base_url=str(self.settings.ai_gateway_base_url)) as client:
            response = await client.post(
                "/v1/responses",
                headers=self._chat_headers(api_key_name),
                json={"model": provider_model, "input": input_text},
                timeout=120,
            )
            response.raise_for_status()
            data = response.json()

        content = str(data.get("output_text") or "")
        if not content:
            chunks: list[str] = []
            for item in data.get("output") or []:
                for part in (item or {}).get("content") or []:
                    if part.get("type") in {"output_text", "text"}:
                        chunks.append(str(part.get("text") or ""))
            content = "\n".join(chunks)
        usage_block = data.get("usage") or {}
        request_id = str(data.get("id") or "responses-response")
        return CompletionOutcome(
            content=content,
            request_id=request_id,
            usage=GatewayUsage(
                provider_request_id=request_id,
                input_tokens=int(usage_block.get("input_tokens") or 0),
                output_tokens=int(usage_block.get("output_tokens") or 0),
            ),
        )

    async def _gemini_generate_content(
        self,
        provider_model: str,
        messages: list[dict[str, Any]],
        *,
        api_key_name: str | None = None,
    ) -> CompletionOutcome:
        contents = []
        for msg in messages:
            role = "model" if msg.get("role") == "assistant" else "user"
            contents.append({"role": role, "parts": [{"text": str(msg.get("content") or "")}]})

        async with httpx.AsyncClient(base_url=str(self.settings.ai_gateway_base_url)) as client:
            response = await client.post(
                f"/v1beta/models/{provider_model}:generateContent",
                headers=self._api_headers(api_key_name),
                json={"contents": contents, "generationConfig": {}},
                timeout=120,
            )
            response.raise_for_status()
            data = response.json()

        parts: list[str] = []
        for candidate in data.get("candidates") or []:
            for part in ((candidate or {}).get("content") or {}).get("parts") or []:
                if "text" in part:
                    parts.append(str(part.get("text") or ""))
        usage_block = data.get("usageMetadata") or {}
        request_id = str(data.get("responseId") or "gemini-response")
        return CompletionOutcome(
            content="\n".join(parts),
            request_id=request_id,
            usage=GatewayUsage(
                provider_request_id=request_id,
                input_tokens=int(usage_block.get("promptTokenCount") or 0),
                output_tokens=int(usage_block.get("candidatesTokenCount") or 0),
            ),
        )

    async def _anthropic_messages(
        self,
        provider_model: str,
        messages: list[dict[str, Any]],
        *,
        api_key_name: str | None = None,
    ) -> CompletionOutcome:
        system_parts = [str(m.get("content") or "") for m in messages if m.get("role") == "system"]
        anth_messages = [
            {"role": "assistant" if m.get("role") == "assistant" else "user", "content": str(m.get("content") or "")}
            for m in messages
            if m.get("role") != "system"
        ]
        async with httpx.AsyncClient(base_url=str(self.settings.ai_gateway_base_url)) as client:
            response = await client.post(
                "/v1/messages",
                headers={
                    **self._chat_headers(api_key_name),
                    "anthropic-version": "2023-06-01",
                },
                json={
                    "model": provider_model,
                    "max_tokens": 4096,
                    "system": "\n\n".join(system_parts) or None,
                    "messages": anth_messages,
                },
                timeout=120,
            )
            response.raise_for_status()
            data = response.json()

        content = "\n".join(
            [str(part.get("text") or "") for part in data.get("content") or [] if part.get("type") == "text"]
        )
        usage_block = data.get("usage") or {}
        request_id = str(data.get("id") or "anthropic-response")
        return CompletionOutcome(
            content=content,
            request_id=request_id,
            usage=GatewayUsage(
                provider_request_id=request_id,
                input_tokens=int(usage_block.get("input_tokens") or 0),
                output_tokens=int(usage_block.get("output_tokens") or 0),
            ),
        )

    async def fetch_usage(self, provider_request_id: str) -> GatewayUsage:
        if self.settings.ai_gateway_base_url is None:
            return GatewayUsage(provider_request_id=provider_request_id, input_tokens=0, output_tokens=0)

        async with httpx.AsyncClient(base_url=str(self.settings.ai_gateway_base_url)) as client:
            response = await client.get(
                f"/v1/usage/{provider_request_id}",
                headers={"Authorization": f"Bearer {self.settings.ai_gateway_api_key}"},
                timeout=30,
            )
            response.raise_for_status()
            data = response.json()
            return GatewayUsage(
                provider_request_id=provider_request_id,
                input_tokens=int(data.get("input_tokens", 0)),
                output_tokens=int(data.get("output_tokens", 0)),
            )

    async def generate_gemini_image(
        self,
        provider_model: str,
        contents: list[dict[str, Any]],
        generation_config: dict[str, Any] | None = None,
        api_key_name: str | None = None,
    ) -> ImageGenerationOutcome:
        """Yunwu Gemini image/multimodal path: /v1beta/models/{model}:generateContent."""
        if self.settings.ai_gateway_base_url is None:
            return ImageGenerationOutcome(images_b64=[], request_id="dev-image-request")

        async with httpx.AsyncClient(base_url=str(self.settings.ai_gateway_base_url)) as client:
            response = await client.post(
                f"/v1beta/models/{provider_model}:generateContent",
                headers=self._api_headers(api_key_name),
                json={"contents": contents, "generationConfig": generation_config or {}},
                timeout=180,
            )
            response.raise_for_status()
            data = response.json()

        images: list[str] = []
        for candidate in data.get("candidates") or []:
            for part in ((candidate or {}).get("content") or {}).get("parts") or []:
                inline = part.get("inlineData") or part.get("inline_data") or {}
                if inline.get("data"):
                    images.append(str(inline["data"]))
        return ImageGenerationOutcome(
            images_b64=images,
            request_id=str(data.get("responseId") or "gemini-image-response"),
        )

    async def generate_seedream_image(
        self,
        provider_model: str,
        prompt: str,
        *,
        size: str = "1024x1024",
        image_b64: str | None = None,
        api_key_name: str | None = None,
    ) -> ImageGenerationOutcome:
        """Yunwu Seedream/Doubao image path: OpenAI-style /v1/images/generations."""
        if self.settings.ai_gateway_base_url is None:
            return ImageGenerationOutcome(images_b64=[], request_id="dev-seedream-request")

        payload: dict[str, Any] = {
            "model": provider_model,
            "prompt": prompt,
            "size": size,
            "response_format": "b64_json",
        }
        if image_b64:
            payload["image"] = image_b64

        async with httpx.AsyncClient(base_url=str(self.settings.ai_gateway_base_url)) as client:
            response = await client.post(
                "/v1/images/generations",
                headers=self._api_headers(api_key_name),
                json=payload,
                timeout=180,
            )
            response.raise_for_status()
            data = response.json()

        rows = data.get("data") or []
        return ImageGenerationOutcome(
            images_b64=[str(row.get("b64_json") or "") for row in rows if row.get("b64_json")],
            request_id=str(data.get("id") or "seedream-image-response"),
        )

    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """OpenAI-compatible /v1/embeddings; returns empty vectors in dev mode."""
        dim = self.settings.embedding_dimensions
        if not texts:
            return []
        if self.settings.ai_gateway_base_url is None:
            return [[0.0] * dim for _ in texts]

        async with httpx.AsyncClient(base_url=str(self.settings.ai_gateway_base_url)) as client:
            response = await client.post(
                "/v1/embeddings",
                headers={"Authorization": f"Bearer {self.settings.ai_gateway_api_key}"},
                json={"model": self.settings.embedding_model, "input": texts},
                timeout=120,
            )
            response.raise_for_status()
            data = response.json()

        rows = sorted((data.get("data") or []), key=lambda x: int(x.get("index", 0)))
        out: list[list[float]] = []
        for row in rows:
            vec = row.get("embedding")
            if not isinstance(vec, list):
                raise ValueError("embedding response missing vector")
            out.append([float(x) for x in vec])
        if len(out) != len(texts):
            raise ValueError("embedding batch size mismatch")
        return out
