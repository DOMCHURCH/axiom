"""Financial Modeling Prep client — fundamentals, budget-limited to 250 calls/day.

A cache hit never consumes budget. Only on a miss do we spend a throttle token.
When the daily budget is gone, `BudgetExhausted` propagates so the enrichment
stage can stop cleanly (survivors fall back to free SEC Company Facts / wait).
"""

from __future__ import annotations

from app.config import settings
from app.core.cache import _key, cache_get, cache_set
from app.core.http import get_json_once
from app.core.logging import get_logger
from app.core.ratelimit import BudgetExhausted
from app.data.limits import fmp_throttle

log = get_logger("fmp")

BASE = "https://financialmodelingprep.com/api/v3"
CACHE_TTL = 7 * 24 * 3600  # fundamentals change slowly
# Keep scan-time calls snappy: the scanner enriches many names in sequence, so a
# slow/blocked FMP must fail fast rather than burn the whole stage budget.
REQUEST_TIMEOUT = 8.0


def _get(path: str, params: dict | None = None, ttl: int = CACHE_TTL,
         timeout: float = REQUEST_TIMEOUT):
    params = dict(params or {})
    key = _key("fmp", path, *[f"{k}={params[k]}" for k in sorted(params)])
    hit = cache_get(key)
    if hit is not None:
        return hit

    fmp_throttle.acquire()  # raises BudgetExhausted when the 250/day cap is hit
    params["apikey"] = settings.fmp_api_key
    try:
        data = get_json_once(f"{BASE}/{path}", params=params, timeout=timeout)
    except BudgetExhausted:
        raise
    except Exception as exc:
        log.warning("fmp request failed", extra={"path": path, "err": str(exc)})
        return None
    if data is not None:
        cache_set(key, data, ttl)
    return data


def _first(data):
    return data[0] if isinstance(data, list) and data else (data or None)


def profile(ticker: str) -> dict | None:
    return _first(_get(f"profile/{ticker}"))


def quote(ticker: str) -> dict | None:
    return _first(_get(f"quote/{ticker}", ttl=900))


def income_statement(ticker: str, period: str = "annual", limit: int = 5) -> list | None:
    return _get(f"income-statement/{ticker}", {"period": period, "limit": limit})


def balance_sheet(ticker: str, period: str = "annual", limit: int = 5) -> list | None:
    return _get(f"balance-sheet-statement/{ticker}", {"period": period, "limit": limit})


def cash_flow(ticker: str, period: str = "annual", limit: int = 5) -> list | None:
    return _get(f"cash-flow-statement/{ticker}", {"period": period, "limit": limit})


def ratios(ticker: str, period: str = "annual", limit: int = 5) -> list | None:
    return _get(f"ratios/{ticker}", {"period": period, "limit": limit})


def key_metrics(ticker: str, period: str = "annual", limit: int = 5) -> list | None:
    return _get(f"key-metrics/{ticker}", {"period": period, "limit": limit})


def economic_calendar(from_date: str, to_date: str) -> list | None:
    """Upcoming/recent macro releases (GDP, CPI, payrolls, rate decisions...).
    `from_date`/`to_date` are ISO dates. Cached 6h (calendar is stable intraday)."""
    return _get("economic_calendar", {"from": from_date, "to": to_date}, ttl=6 * 3600)


def budget_remaining() -> int:
    return fmp_throttle.remaining_day() or 0


def historical_prices(ticker: str, days: int = 260) -> list | None:
    """Daily OHLCV history for one ticker, newest-first.

    One request per ticker — same shape as the Yahoo chart endpoint — but with a
    published rate limit and a hard 8s timeout, so it fails fast instead of
    hanging. That's the property that matters when Yahoo has started stalling:
    the scan gets a real answer or a real error, never an open socket.

    Bars are daily, so this is cached for 4h — a re-scan the same session spends
    no budget. Costs one of the 250/day calls on a miss.
    """
    data = _get(f"historical-price-full/{ticker}",
                {"timeseries": max(1, int(days))}, ttl=4 * 3600)
    if not data:
        return None
    rows = data.get("historical") if isinstance(data, dict) else None
    return rows or None
