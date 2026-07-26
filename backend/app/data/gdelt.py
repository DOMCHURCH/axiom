"""GDELT — unlimited news volume + tone (sentiment). No key.

DOC 2.0 API: ArtList for headlines, ToneChart for an aggregate tone distribution.
Tone roughly spans -100..100 (usually -10..10); we map avg tone/10 -> [-1, 1].
"""

from __future__ import annotations

from app.core.cache import _key, cache_get, cache_set
from app.core.http import get_json
from app.core.logging import get_logger
from app.data.limits import gdelt_throttle

log = get_logger("gdelt")

BASE = "https://api.gdeltproject.org/api/v2/doc/doc"


def _clip(x: float, lo: float = -1.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def articles(query: str, timespan: str = "7d", maxrecords: int = 20) -> list[dict]:
    key = _key("gdelt_art", query, timespan, maxrecords)
    hit = cache_get(key)
    if hit is not None:
        return hit
    gdelt_throttle.acquire()
    try:
        data = get_json(BASE, params={
            "query": f'"{query}"', "mode": "ArtList", "format": "json",
            "timespan": timespan, "maxrecords": maxrecords, "sort": "DateDesc",
        }, timeout=12)
    except Exception as exc:
        log.warning("gdelt artlist failed", extra={"query": query, "err": str(exc)})
        return []
    arts = (data or {}).get("articles", []) if isinstance(data, dict) else []
    out = [{
        "title": a.get("title"),
        "url": a.get("url"),
        "source": a.get("domain"),
        "published_at": a.get("seendate"),
    } for a in arts]
    cache_set(key, out, 6 * 3600)
    return out


def tone(query: str, timespan: str = "7d") -> dict:
    """Aggregate sentiment: {sentiment_score in [-1,1], volume, avg_tone}."""
    key = _key("gdelt_tone", query, timespan)
    hit = cache_get(key)
    if hit is not None:
        return hit
    gdelt_throttle.acquire()
    try:
        data = get_json(BASE, params={
            "query": f'"{query}"', "mode": "ToneChart", "format": "json",
            "timespan": timespan,
        }, timeout=12)
    except Exception as exc:
        log.warning("gdelt tone failed", extra={"query": query, "err": str(exc)})
        return {"sentiment_score": None, "volume": 0, "avg_tone": None}

    bins = (data or {}).get("tonechart", []) if isinstance(data, dict) else []
    total = sum(b.get("count", 0) for b in bins)
    if total == 0:
        result = {"sentiment_score": None, "volume": 0, "avg_tone": None}
    else:
        weighted = sum(b.get("bin", 0) * b.get("count", 0) for b in bins)
        avg = weighted / total
        result = {"sentiment_score": round(_clip(avg / 10.0), 4), "volume": total,
                  "avg_tone": round(avg, 3)}
    cache_set(key, result, 6 * 3600)
    return result
