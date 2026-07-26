"""OpenRouter chat client (GLM-5.2 by default).

Thin wrapper over the OpenAI-compatible /chat/completions endpoint with retry,
token accounting, and optional JSON response formatting.
"""

from __future__ import annotations

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential_jitter

from app.config import settings
from app.core.logging import get_logger

log = get_logger("openrouter")


class OpenRouterError(Exception):
    pass


class TransientAIError(OpenRouterError):
    pass


_client = httpx.Client(timeout=httpx.Timeout(120.0, connect=15.0))


def _headers() -> dict:
    if not settings.openrouter_api_key:
        raise OpenRouterError("OPENROUTER_API_KEY is not set")
    return {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://axiom.research",
        "X-Title": settings.app_name,
    }


@retry(
    reraise=True,
    stop=stop_after_attempt(3),
    wait=wait_exponential_jitter(initial=1.0, max=20.0),
    retry=retry_if_exception_type((TransientAIError, httpx.TransportError, httpx.TimeoutException)),
)
def chat(messages: list[dict], *, model: str | None = None, temperature: float = 0.35,
         max_tokens: int = 6000, json_mode: bool = False,
         reasoning: dict | None = None) -> dict:
    """Return {content, usage, model, raw, reasoning}. Raises OpenRouterError on hard failure.

    GLM-5.2 is a reasoning model: hidden reasoning tokens are spent before `content`
    is emitted, so `max_tokens` must be generous. `reasoning` passes OpenRouter's
    reasoning controls, e.g. {"effort": "medium"} or {"enabled": False}.
    """
    body: dict = {
        "model": model or settings.openrouter_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    if reasoning is not None:
        body["reasoning"] = reasoning

    # enforce the lifetime token budget before spending
    from app.ai.budget import check_budget
    check_budget()

    resp = _client.post(f"{settings.openrouter_base_url}/chat/completions",
                        json=body, headers=_headers())
    if resp.status_code == 429 or resp.status_code >= 500:
        raise TransientAIError(f"{resp.status_code}: {resp.text[:200]}")
    if resp.status_code >= 400:
        raise OpenRouterError(f"{resp.status_code}: {resp.text[:400]}")

    data = resp.json()
    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError) as exc:
        raise OpenRouterError(f"unexpected response shape: {str(data)[:300]}") from exc
    usage = data.get("usage", {})
    from app.ai.budget import add_tokens
    add_tokens(usage.get("total_tokens"))
    message = data["choices"][0]["message"]
    finish = data["choices"][0].get("finish_reason")
    if not content and finish == "length":
        raise OpenRouterError(
            "reasoning consumed the whole token budget before content — raise max_tokens"
        )
    log.info("openrouter completion", extra={
        "model": body["model"],
        "prompt_tokens": usage.get("prompt_tokens"),
        "completion_tokens": usage.get("completion_tokens"),
        "finish": finish,
    })
    return {
        "content": content,
        "reasoning": message.get("reasoning"),
        "usage": usage,
        "model": data.get("model", body["model"]),
        "finish_reason": finish,
        "raw": data,
    }


def complete(system: str, user: str, *, json_mode: bool = False, **kw) -> dict:
    return chat([{"role": "system", "content": system},
                 {"role": "user", "content": user}], json_mode=json_mode, **kw)
