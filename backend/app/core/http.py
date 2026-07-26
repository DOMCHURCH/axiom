"""Shared synchronous HTTP client with retry/backoff.

Data provider clients run inside (sync) background job threads, so this is a sync
client. Retries fire on 429 / 5xx / network errors with exponential backoff+jitter.
"""

from __future__ import annotations

import httpx
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential_jitter,
)

from app.core.logging import get_logger

log = get_logger("http")


class TransientHTTPError(Exception):
    """Retryable HTTP condition (429 / 5xx)."""


_RETRYABLE = (TransientHTTPError, httpx.TransportError, httpx.TimeoutException)

_client = httpx.Client(
    timeout=httpx.Timeout(25.0, connect=10.0),
    headers={"Accept": "application/json"},
    follow_redirects=True,
    limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
)


def _check(resp: httpx.Response) -> httpx.Response:
    if resp.status_code == 429 or resp.status_code >= 500:
        raise TransientHTTPError(f"{resp.status_code} for {resp.request.url}")
    resp.raise_for_status()
    return resp


@retry(
    reraise=True,
    stop=stop_after_attempt(4),
    wait=wait_exponential_jitter(initial=0.5, max=8.0),
    retry=retry_if_exception_type(_RETRYABLE),
)
def get_json(url: str, *, params: dict | None = None, headers: dict | None = None,
             timeout: float | None = None) -> dict | list:
    resp = _client.get(url, params=params, headers=headers,
                       timeout=timeout if timeout else None)
    return _check(resp).json()


def get_json_once(url: str, *, params: dict | None = None, headers: dict | None = None,
                  timeout: float | None = None) -> dict | list:
    """Single-attempt GET (no retry) for providers where retrying is pointless.

    Used by rate-limited/daily-budgeted providers during a scan: a 429 means the
    budget is the constraint, not a transient blip, so burning 4 attempts with
    backoff only stalls the pipeline. Callers treat a failure as "no data".
    """
    resp = _client.get(url, params=params, headers=headers,
                       timeout=timeout if timeout else None)
    return _check(resp).json()


@retry(
    reraise=True,
    stop=stop_after_attempt(4),
    wait=wait_exponential_jitter(initial=0.5, max=8.0),
    retry=retry_if_exception_type(_RETRYABLE),
)
def get_text(url: str, *, params: dict | None = None, headers: dict | None = None,
             timeout: float | None = None) -> str:
    resp = _client.get(url, params=params, headers=headers,
                       timeout=timeout if timeout else None)
    return _check(resp).text


@retry(
    reraise=True,
    stop=stop_after_attempt(3),
    wait=wait_exponential_jitter(initial=0.5, max=8.0),
    retry=retry_if_exception_type(_RETRYABLE),
)
def post_json(url: str, *, json: dict | None = None, headers: dict | None = None,
              timeout: float | None = None) -> dict | list:
    resp = _client.post(url, json=json, headers=headers,
                        timeout=timeout if timeout else None)
    return _check(resp).json()
