"""Whole-market snapshot — price + volume + market cap for EVERY ticker, cheaply.

Why this exists
---------------
Yahoo's chart endpoint takes the symbol in the URL *path*, so
`yfinance.download()` issues ONE HTTP REQUEST PER TICKER (verified in
yfinance/multi.py: it loops `for i, ticker in enumerate(tickers)`). Scanning
~10,300 names therefore costs ~10,300 requests — that is the scan's real
bottleneck, not payload size or pandas.

Yahoo's *quote* endpoint (`v7/finance/quote?symbols=A,B,C`) IS genuinely
batched, so the whole market fits in ~70 requests. That is enough to run the
liquidity gate and a cheap pre-rank, which lets the expensive per-ticker history
fetch run over a few hundred survivors instead of the entire universe.

Everything here is best-effort: any failure returns partial or empty data and the
caller falls back to scanning without a prefilter. A missing field stays None —
never a fabricated number.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed

from app.core.logging import get_logger

log = get_logger("market_snapshot")

QUOTE_URL = "https://query2.finance.yahoo.com/v7/finance/quote"

# Yahoo's quote endpoint accepts many symbols per call; keep well under any URL
# length limit (150 x ~6 chars is ~1KB of query string).
BATCH = 150
WORKERS = 8

_FIELDS = (
    "symbol", "regularMarketPrice", "regularMarketVolume", "averageDailyVolume3Month",
    "averageDailyVolume10Day", "marketCap", "fiftyDayAverage", "twoHundredDayAverage",
    "fiftyTwoWeekHigh", "fiftyTwoWeekLow",
)


def _f(x) -> float | None:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if v == v and v not in (float("inf"), float("-inf")) else None


def _row(q: dict) -> dict:
    """Normalize one Yahoo quote row. Absent fields stay None."""
    price = _f(q.get("regularMarketPrice"))
    # Prefer the 3-month average volume; fall back to 10-day, then today's volume.
    adv = (_f(q.get("averageDailyVolume3Month"))
           or _f(q.get("averageDailyVolume10Day"))
           or _f(q.get("regularMarketVolume")))
    return {
        "price": price,
        "volume": _f(q.get("regularMarketVolume")),
        "avg_volume": adv,
        # approximate average dollar volume — good enough to GATE on, never scored
        "avg_dollar_volume": (price * adv) if (price is not None and adv is not None) else None,
        "market_cap": _f(q.get("marketCap")),
        "sma_50": _f(q.get("fiftyDayAverage")),
        "sma_200": _f(q.get("twoHundredDayAverage")),
        "high_52w": _f(q.get("fiftyTwoWeekHigh")),
        "low_52w": _f(q.get("fiftyTwoWeekLow")),
    }


def _fetch_chunk(symbols: list[str]) -> dict[str, dict]:
    """One batched quote request. Reuses yfinance's session so we inherit its
    cookie/crumb handling and browser impersonation rather than reimplementing it."""
    try:
        from yfinance.data import YfData
        raw = YfData().get_raw_json(
            QUOTE_URL,
            params={"symbols": ",".join(symbols), "fields": ",".join(_FIELDS)},
            timeout=20,
        )
    except Exception as exc:  # noqa: BLE001 — network/auth/shape; caller degrades
        log.debug("quote chunk failed", extra={"n": len(symbols), "err": str(exc)})
        return {}

    try:
        results = (raw or {}).get("quoteResponse", {}).get("result") or []
    except AttributeError:
        return {}

    out: dict[str, dict] = {}
    for q in results:
        sym = (q or {}).get("symbol")
        if sym:
            out[str(sym).upper()] = _row(q)
    return out


def whole_market(tickers: list[str], *, batch: int = BATCH, workers: int = WORKERS,
                 on_progress=None) -> dict[str, dict]:
    """Snapshot every ticker. Returns {TICKER: {...}} — possibly partial, never raises.

    `on_progress(done, total)` is called as chunks land so the scan can report
    real movement.
    """
    if not tickers:
        return {}
    chunks = [tickers[i:i + batch] for i in range(0, len(tickers), batch)]
    snap: dict[str, dict] = {}
    done = 0
    try:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = [pool.submit(_fetch_chunk, c) for c in chunks]
            for fut in as_completed(futures):
                try:
                    snap.update(fut.result() or {})
                except Exception as exc:  # noqa: BLE001
                    log.debug("quote future failed", extra={"err": str(exc)})
                done += 1
                if on_progress:
                    on_progress(done, len(chunks))
    except Exception as exc:  # noqa: BLE001 — pool creation/shutdown
        log.warning("snapshot pool failed", extra={"err": str(exc)})

    log.info("market snapshot", extra={"requested": len(tickers), "got": len(snap),
                                       "requests": len(chunks)})
    return snap
