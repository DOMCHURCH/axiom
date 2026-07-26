"""Live, multi-source company news — Finnhub + GDELT + Yahoo, merged.

The old news endpoint read a DB table that the trade scan never populated, so it
was always empty. This fetches live from three sources, dedupes, sorts newest-
first, and attaches an aggregate news-tone. Cached ~20 min per ticker. Sync
(runs inside a thread from the async route); every source is best-effort.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone

from app.core.cache import _key, cache_get, cache_set
from app.core.logging import get_logger
from app.data import finnhub, gdelt, yahoo

log = get_logger("news_feed")

CACHE_TTL = 20 * 60


def _norm_title(t: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", "", (t or "").lower())[:80]


def _parse_dt(v) -> datetime | None:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        try:
            return datetime.fromtimestamp(int(v), tz=timezone.utc)
        except Exception:  # noqa: BLE001
            return None
    s = str(v)
    # GDELT seendate: 20240607T120000Z
    m = re.match(r"^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$", s)
    if m:
        y, mo, d, h, mi, se = map(int, m.groups())
        try:
            return datetime(y, mo, d, h, mi, se, tzinfo=timezone.utc)
        except Exception:  # noqa: BLE001
            return None
    for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(s.replace("+00:00", "Z"), fmt)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except Exception:  # noqa: BLE001
            continue
    return None


def _finnhub(ticker: str) -> list[dict]:
    out = []
    for a in finnhub.company_news(ticker, days=7) or []:
        if a.get("headline") and a.get("url"):
            out.append({"headline": a["headline"], "url": a["url"],
                        "source": a.get("source") or "Finnhub", "provider": "Finnhub",
                        "published_at": _parse_dt(a.get("datetime"))})
    return out


def _gdelt(query: str) -> list[dict]:
    out = []
    for a in gdelt.articles(query, timespan="7d", maxrecords=15) or []:
        if a.get("title") and a.get("url"):
            out.append({"headline": a["title"], "url": a["url"],
                        "source": a.get("source") or "GDELT", "provider": "GDELT",
                        "published_at": _parse_dt(a.get("published_at"))})
    return out


def _yahoo(ticker: str) -> list[dict]:
    out = []
    for a in yahoo.news(ticker, limit=10) or []:
        out.append({"headline": a["title"], "url": a["url"],
                    "source": a.get("source") or "Yahoo Finance", "provider": "Yahoo",
                    "published_at": _parse_dt(a.get("published_at"))})
    return out


def fetch_news(ticker: str, name: str | None = None, limit: int = 18) -> dict:
    key = _key("news_feed_v1", ticker, limit)
    hit = cache_get(key)
    if hit is not None:
        return hit

    query = name or ticker
    articles: list[dict] = []
    for fn in (lambda: _finnhub(ticker), lambda: _gdelt(query), lambda: _yahoo(ticker)):
        try:
            articles.extend(fn())
        except Exception as exc:  # noqa: BLE001
            log.warning("news source failed", extra={"ticker": ticker, "err": str(exc)})

    # dedupe by url and by normalized title
    seen_url, seen_title, merged = set(), set(), []
    for a in articles:
        u = a["url"]
        t = _norm_title(a["headline"])
        if u in seen_url or (t and t in seen_title):
            continue
        seen_url.add(u)
        if t:
            seen_title.add(t)
        merged.append(a)

    merged.sort(key=lambda a: a["published_at"] or datetime(1970, 1, 1, tzinfo=timezone.utc),
                reverse=True)

    tone = {}
    try:
        tone = gdelt.tone(query) or {}
    except Exception:  # noqa: BLE001
        tone = {}

    providers = sorted({a["provider"] for a in merged})
    out = {
        "ticker": ticker,
        "sources_used": providers,
        "tone": {
            "sentiment_score": tone.get("sentiment_score"),
            "volume": tone.get("volume"),
            "label": _tone_label(tone.get("sentiment_score")),
        },
        "news": [{
            "headline": a["headline"], "url": a["url"], "source": a["source"],
            "provider": a["provider"],
            "published_at": a["published_at"].isoformat() if a["published_at"] else None,
        } for a in merged[:limit]],
    }
    cache_set(key, out, CACHE_TTL)
    return out


def _tone_label(score) -> str | None:
    if score is None:
        return None
    if score > 0.15:
        return "Positive"
    if score < -0.15:
        return "Negative"
    return "Neutral"
