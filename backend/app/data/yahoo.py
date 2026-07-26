"""Yahoo Finance (yfinance) — unlimited price data for the whole universe.

Used for: bulk daily OHLCV (the cheap scan stage), plus light profile/market-cap
enrichment. Returns normalized pandas DataFrames the quant engine consumes.
"""

from __future__ import annotations

import pandas as pd
import yfinance as yf

from app.config import settings
from app.core.logging import get_logger

# yfinance caches each ticker's exchange timezone in a small SQLite file. If that
# location isn't writable (common in a container), the cache silently misses and
# EVERY ticker fires a second chart request purely to read its timezone —
# doubling the request count of an entire scan. Pin it somewhere writable.
try:  # pragma: no cover - best effort, never block startup
    import os as _os
    _tz_dir = _os.environ.get("YF_CACHE_DIR", "/tmp/yf-cache")
    _os.makedirs(_tz_dir, exist_ok=True)
    yf.set_tz_cache_location(_tz_dir)
except Exception as _exc:  # noqa: BLE001
    get_logger("yahoo").warning("could not set yfinance tz cache location",
                                extra={"err": str(_exc)})

log = get_logger("yahoo")

_COLMAP = {
    "Open": "open", "High": "high", "Low": "low",
    "Close": "close", "Adj Close": "adj_close", "Volume": "volume",
}


def _normalize(df: pd.DataFrame) -> pd.DataFrame:
    if df is None or df.empty:
        return pd.DataFrame(columns=list(_COLMAP.values()))
    df = df.rename(columns=_COLMAP)
    keep = [c for c in _COLMAP.values() if c in df.columns]
    df = df[keep].copy()
    df = df.dropna(how="all")
    idx = pd.to_datetime(df.index)
    if getattr(idx, "tz", None) is not None:
        idx = idx.tz_localize(None)
    df.index = idx
    df.index.name = "ts"
    return df


def fetch_ohlcv(ticker: str, period: str = "1y", interval: str = "1d") -> pd.DataFrame:
    """OHLCV for one ticker."""
    df = yf.download(ticker, period=period, interval=interval, auto_adjust=False,
                     actions=False, progress=False, threads=False, timeout=30)
    if isinstance(df.columns, pd.MultiIndex):
        # single ticker sometimes returns a 2-level column index
        df.columns = df.columns.get_level_values(0)
    return _normalize(df)


def download_batch(tickers: list[str], period: str = "1y", interval: str = "1d",
                   threads: int | None = None) -> dict[str, pd.DataFrame]:
    """OHLCV for many tickers. Returns {ticker: DataFrame}.

    NOTE: despite the name, yfinance does NOT batch these — the Yahoo chart
    endpoint takes the symbol in the URL path, so `yf.download` issues one HTTP
    request PER TICKER. Concurrency is therefore the only lever that matters, and
    yfinance's `threads=True` default is just `cpu_count() * 2` — which is 2-4 on
    a small container. Passing an explicit thread count is the single cheapest
    speedup available here.
    """
    if not tickers:
        return {}
    if len(tickers) == 1:
        return {tickers[0]: fetch_ohlcv(tickers[0], period, interval)}

    workers = threads or settings.scan_yf_threads
    data = yf.download(tickers=" ".join(tickers), period=period, interval=interval,
                       group_by="ticker", auto_adjust=False, actions=False,
                       threads=max(2, int(workers)), progress=False, timeout=30)
    out: dict[str, pd.DataFrame] = {}
    if isinstance(data.columns, pd.MultiIndex):
        available = set(data.columns.get_level_values(0))
        for t in tickers:
            if t in available:
                out[t] = _normalize(data[t])
    else:  # yfinance collapsed to a single frame
        for t in tickers:
            out[t] = _normalize(data)
    return out


def fetch_prices_bulk(tickers: list[str], period: str = "1y", interval: str = "1d",
                      batch_size: int = 150) -> dict[str, pd.DataFrame]:
    """Chunk a large universe into batched downloads to respect Yahoo's URL limits.

    Any ticker missing/empty after a batch (e.g. yfinance tz-cache lock under
    threading) is retried once single-threaded so names aren't silently dropped.
    """
    result: dict[str, pd.DataFrame] = {}
    for i in range(0, len(tickers), batch_size):
        batch = tickers[i:i + batch_size]
        try:
            result.update(download_batch(batch, period, interval))
        except Exception as exc:  # a bad batch shouldn't kill the whole scan
            log.warning("yahoo batch failed", extra={"start": i, "size": len(batch), "err": str(exc)})
        # single-threaded retry for anything the batch missed (capped so a broad
        # block/outage can never turn into a multi-minute retry storm — with a
        # ~1.5k-name universe even a small per-batch cap adds up, so keep it tight)
        missing = [t for t in batch if result.get(t) is None or result[t].empty]
        for t in missing[:8]:
            try:
                df = fetch_ohlcv(t, period, interval)
                if df is not None and not df.empty:
                    result[t] = df
            except Exception as exc:
                log.debug("yahoo single retry failed", extra={"ticker": t, "err": str(exc)})
    got = sum(1 for d in result.values() if d is not None and not d.empty)
    log.info("bulk prices fetched", extra={"requested": len(tickers), "got": got})
    return result


def get_profile(ticker: str) -> dict:
    """Sector / industry / market cap / exchange for one ticker (best-effort)."""
    try:
        info = yf.Ticker(ticker).get_info()
    except Exception:
        return {}
    if not info:
        return {}
    return {
        "name": info.get("longName") or info.get("shortName"),
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "market_cap": info.get("marketCap"),
        "exchange": info.get("exchange"),
        "currency": info.get("currency", "USD"),
        "shares_outstanding": info.get("sharesOutstanding"),
        "beta": info.get("beta"),
    }


def news(ticker: str, limit: int = 10) -> list[dict]:
    """Recent headlines for one ticker via yfinance (best-effort, shape-tolerant)."""
    try:
        raw = yf.Ticker(ticker).news or []
    except Exception:  # noqa: BLE001 — network / block
        return []
    out: list[dict] = []
    for item in raw[: limit * 2]:
        # yfinance 1.5.x nests under "content"; older versions are flat
        c = item.get("content") if isinstance(item, dict) else None
        if isinstance(c, dict):
            title = c.get("title")
            url = ((c.get("clickThroughUrl") or {}) or (c.get("canonicalUrl") or {})).get("url")
            source = (c.get("provider") or {}).get("displayName")
            published = c.get("pubDate")  # ISO string
        else:
            title = item.get("title")
            url = item.get("link")
            source = item.get("publisher")
            ts = item.get("providerPublishTime")
            published = None
            if ts:
                try:
                    from datetime import datetime, timezone
                    published = datetime.fromtimestamp(int(ts), tz=timezone.utc).isoformat()
                except Exception:  # noqa: BLE001
                    published = None
        if title and url:
            out.append({"title": title, "url": url, "source": source or "Yahoo Finance",
                        "published_at": published})
    return out[:limit]


def get_quote(ticker: str) -> dict:
    """Fast last price + market cap (best-effort, no heavy .info call)."""
    try:
        fi = yf.Ticker(ticker).fast_info
        return {
            "last_price": getattr(fi, "last_price", None),
            "market_cap": getattr(fi, "market_cap", None),
            "shares": getattr(fi, "shares", None),
        }
    except Exception:
        return {}
