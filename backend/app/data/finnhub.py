"""Finnhub client — earnings, insider transactions, analyst recs, company news.

60 calls/min (blocking throttle). Cached to avoid re-hitting for the same day.
"""

from __future__ import annotations

from datetime import date, timedelta

from app.config import settings
from app.core.cache import _key, cache_get, cache_set
from app.core.http import get_json
from app.core.logging import get_logger
from app.data.limits import finnhub_throttle

log = get_logger("finnhub")

BASE = "https://finnhub.io/api/v1"


def _get(path: str, params: dict, ttl: int):
    key = _key("finnhub", path, *[f"{k}={params[k]}" for k in sorted(params)])
    hit = cache_get(key)
    if hit is not None:
        return hit
    finnhub_throttle.acquire()
    p = dict(params)
    p["token"] = settings.finnhub_api_key
    try:
        data = get_json(f"{BASE}/{path}", params=p)
    except Exception as exc:
        log.warning("finnhub failed", extra={"path": path, "err": str(exc)})
        return None
    if data is not None:
        cache_set(key, data, ttl)
    return data


def company_news(ticker: str, days: int = 7) -> list:
    today = date.today()
    start = today - timedelta(days=days)
    data = _get("company-news", {"symbol": ticker, "from": start.isoformat(),
                                 "to": today.isoformat()}, ttl=3600)
    return data or []


def earnings_surprises(ticker: str, limit: int = 8) -> list:
    data = _get("stock/earnings", {"symbol": ticker, "limit": limit}, ttl=6 * 3600)
    return data or []


def insider_transactions(ticker: str) -> dict:
    data = _get("stock/insider-transactions", {"symbol": ticker}, ttl=6 * 3600)
    return data or {}


def recommendation_trends(ticker: str) -> list:
    data = _get("stock/recommendation", {"symbol": ticker}, ttl=6 * 3600)
    return data or []


def earnings_calendar(ticker: str, days_ahead: int = 14) -> list:
    """Upcoming earnings dates for one ticker ([] if none / on error)."""
    today = date.today()
    to = today + timedelta(days=days_ahead)
    data = _get("calendar/earnings", {"symbol": ticker, "from": today.isoformat(),
                                      "to": to.isoformat()}, ttl=6 * 3600)
    return (data or {}).get("earningsCalendar", []) if isinstance(data, dict) else []
