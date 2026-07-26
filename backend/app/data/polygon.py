"""Polygon/Massive — real-time snapshots. 5/min, 7200/day: used sparingly.

Only powers the on-demand /quote endpoint on the Research page. Never used in
bulk scanning (that's yfinance's job). Short cache so a burst of UI refreshes on
the same ticker doesn't drain the tiny per-minute bucket.
"""

from __future__ import annotations

from app.config import settings
from app.core.cache import _key, cache_get, cache_set
from app.core.http import get_json
from app.core.logging import get_logger
from app.core.ratelimit import BudgetExhausted, RateLimited
from app.data.limits import polygon_throttle

log = get_logger("polygon")

BASE = "https://api.polygon.io"


def snapshot(ticker: str) -> dict | None:
    """Latest snapshot for one ticker. Returns None when rate/budget limited."""
    key = _key("polygon_snap", ticker.upper())
    hit = cache_get(key)
    if hit is not None:
        return hit
    try:
        polygon_throttle.acquire()
    except (RateLimited, BudgetExhausted) as exc:
        log.info("polygon throttled", extra={"ticker": ticker, "reason": str(exc)})
        return None
    try:
        data = get_json(
            f"{BASE}/v2/snapshot/locale/us/markets/stocks/tickers/{ticker.upper()}",
            params={"apiKey": settings.polygon_api_key},
        )
    except Exception as exc:
        log.warning("polygon snapshot failed", extra={"ticker": ticker, "err": str(exc)})
        return None

    t = (data or {}).get("ticker") or {}
    day = t.get("day") or {}
    prev = t.get("prevDay") or {}
    last = (t.get("lastTrade") or {}).get("p") or day.get("c")
    result = {
        "ticker": ticker.upper(),
        "price": last,
        "open": day.get("o"),
        "high": day.get("h"),
        "low": day.get("l"),
        "volume": day.get("v"),
        "prev_close": prev.get("c"),
        "change_pct": t.get("todaysChangePerc"),
        "updated": t.get("updated"),
    }
    cache_set(key, result, 60)
    return result
