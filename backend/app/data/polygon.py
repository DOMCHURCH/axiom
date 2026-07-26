"""Polygon/Massive — real-time snapshots + whole-market daily bars.

`snapshot()` powers the on-demand /quote endpoint on the Research page. Short
cache so a burst of UI refreshes on the same ticker doesn't drain the tiny
per-minute bucket.

`grouped_daily()` is the one endpoint here that scales: it returns **every** US
stock's bar for a given date in a single request, so the cost of a day of history
is 1 request no matter how many tickers need it — where the Yahoo chart endpoint
takes the symbol in the URL path and therefore costs 1 request per ticker. See
`app.data.bars` for how that gets assembled into per-ticker history, and why the
default 5/min tier can't do it inline.
"""

from __future__ import annotations

from datetime import date

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


def grouped_daily(day: str) -> dict[str, dict] | None:
    """Every US stock's OHLCV bar for one date, in ONE request.

    `day` is an ISO date (YYYY-MM-DD). Returns {TICKER: {open, high, low, close,
    volume}}, or None when rate/budget limited or the request failed.

    A market holiday or weekend legitimately returns no results; that's cached as
    an empty dict so we don't re-spend budget rediscovering it. Bars for a closed
    session never change, so the TTL is long.
    """
    key = _key("polygon_grouped", day)
    hit = cache_get(key)
    if hit is not None:
        return hit
    try:
        polygon_throttle.acquire()
    except (RateLimited, BudgetExhausted) as exc:
        log.info("polygon grouped throttled", extra={"day": day, "reason": str(exc)})
        return None
    try:
        data = get_json(
            f"{BASE}/v2/aggs/grouped/locale/us/market/stocks/{day}",
            params={"adjusted": "true", "apiKey": settings.polygon_api_key},
        )
    except Exception as exc:  # noqa: BLE001 — network / block
        log.warning("polygon grouped failed", extra={"day": day, "err": str(exc)})
        return None

    out: dict[str, dict] = {}
    for row in (data or {}).get("results") or []:
        sym = row.get("T")
        if not sym:
            continue
        out[sym.upper()] = {
            "open": row.get("o"), "high": row.get("h"), "low": row.get("l"),
            "close": row.get("c"), "volume": row.get("v"),
        }
    # A settled session is immutable — keep it for a week. Today's bar is still
    # forming, so it gets a short TTL and is re-fetched on the next scan.
    cache_set(key, out, 3600 if day >= str(date.today()) else 7 * 24 * 3600)
    return out
