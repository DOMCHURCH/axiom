"""FRED (Federal Reserve Economic Data, St. Louis Fed) — macro indicators.

Free API key, generous limits. We only read a handful of slow-moving series
(GDP growth, unemployment, jobless claims, CPI, fed funds, yields, VIX), so
everything is heavily cached. Degrades gracefully to [] when FRED_API_KEY is unset.
"""

from __future__ import annotations

from app.config import settings
from app.core.cache import _key, cache_get, cache_set
from app.core.http import get_json
from app.core.logging import get_logger
from app.data.limits import fred_throttle

log = get_logger("fred")

BASE = "https://api.stlouisfed.org/fred"
CACHE_TTL = 6 * 3600  # macro series update daily at most


def _floatify(rows: list[dict]) -> list[dict]:
    out = []
    for r in rows:
        v = r.get("value")
        if v in (None, ".", ""):
            continue
        try:
            out.append({"date": r.get("date"), "value": float(v)})
        except (TypeError, ValueError):
            continue
    return out


def observations(series_id: str, limit: int = 14) -> list[dict]:
    """Most-recent-first list of {date, value} for a FRED series (cleaned)."""
    if not settings.fred_api_key:
        return []
    key = _key("fred_obs", series_id, limit)
    hit = cache_get(key)
    if hit is not None:
        return hit
    fred_throttle.acquire()
    try:
        data = get_json(f"{BASE}/series/observations", params={
            "series_id": series_id, "api_key": settings.fred_api_key,
            "file_type": "json", "sort_order": "desc", "limit": limit,
        }, timeout=15)
    except Exception as exc:  # noqa: BLE001
        log.warning("fred observations failed", extra={"series": series_id, "err": str(exc)})
        return []
    rows = _floatify((data or {}).get("observations", []) if isinstance(data, dict) else [])
    cache_set(key, rows, CACHE_TTL)
    return rows


def latest(series_id: str) -> dict | None:
    rows = observations(series_id, limit=2)
    return rows[0] if rows else None
