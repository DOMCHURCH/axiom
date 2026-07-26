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

import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from app.core.logging import get_logger

log = get_logger("market_snapshot")

QUOTE_URL = "https://query2.finance.yahoo.com/v7/finance/quote"

# Yahoo's quote endpoint accepts many symbols per call; keep well under any URL
# length limit (150 x ~6 chars is ~1KB of query string).
BATCH = 150
# yfinance takes a cookie/crumb lock on EVERY request, so a handful of workers
# spend most of their time queued behind it. More workers keeps the pipe full;
# the lock itself only guards the (cached) crumb lookup, not the HTTP call.
WORKERS = 20

_FIELDS = (
    "symbol", "regularMarketPrice", "regularMarketVolume", "averageDailyVolume3Month",
    "averageDailyVolume10Day", "marketCap", "fiftyDayAverage", "twoHundredDayAverage",
    "fiftyTwoWeekHigh", "fiftyTwoWeekLow",
    # momentum + cheap valuation, so every liquid name can be scored from the
    # snapshot alone rather than only the few that get full history
    "fiftyTwoWeekChangePercent", "regularMarketChangePercent",
    "fiftyDayAverageChangePercent", "twoHundredDayAverageChangePercent",
    "trailingPE", "forwardPE", "priceToBook", "epsTrailingTwelveMonths",
)


def _f(x) -> float | None:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if v == v and v not in (float("inf"), float("-inf")) else None


def _pct(x) -> float | None:
    """Yahoo percent field -> fraction (23.4 -> 0.234). None stays None."""
    v = _f(x)
    return None if v is None else v / 100.0


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
        # Yahoo reports these as percents (e.g. 23.4 == +23.4%); normalize to
        # fractions so they match the rest of the codebase's convention.
        "return_52w": _pct(q.get("fiftyTwoWeekChangePercent")),
        "change_today": _pct(q.get("regularMarketChangePercent")),
        "vs_sma50": _pct(q.get("fiftyDayAverageChangePercent")),
        "vs_sma200": _pct(q.get("twoHundredDayAverageChangePercent")),
        "pe": _f(q.get("trailingPE")),
        "forward_pe": _f(q.get("forwardPE")),
        "pb": _f(q.get("priceToBook")),
        "eps": _f(q.get("epsTrailingTwelveMonths")),
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


def _warm_session() -> None:
    """Fetch the cookie/crumb ONCE before fanning out.

    Every request calls _get_cookie_and_crumb(), which takes a lock. Cold, the
    whole pool piles up on that lock while one thread does the handshake; warming
    it first means the workers start already-authenticated.
    """
    try:
        from yfinance.data import YfData
        YfData().get_raw_json(QUOTE_URL, params={"symbols": "AAPL"}, timeout=15)
    except Exception as exc:  # noqa: BLE001
        log.debug("session warm-up failed", extra={"err": str(exc)})


def whole_market(tickers: list[str], *, batch: int = BATCH, workers: int = WORKERS,
                 budget: float | None = None, on_progress=None) -> dict[str, dict]:
    """Snapshot every ticker. Returns {TICKER: {...}} — possibly partial, never raises.

    `budget` caps the wall clock: whatever has landed by then is returned and the
    rest is abandoned. Partial coverage is fine — the snapshot only has to gate
    and pre-rank, and the exact technicals downstream stay authoritative.
    """
    if not tickers:
        return {}
    chunks = [tickers[i:i + batch] for i in range(0, len(tickers), batch)]
    snap: dict[str, dict] = {}
    done = 0
    deadline = (time.monotonic() + budget) if budget else None
    _warm_session()
    try:
        pool = ThreadPoolExecutor(max_workers=workers)
        futures = [pool.submit(_fetch_chunk, c) for c in chunks]
        try:
            timeout = max(0.1, deadline - time.monotonic()) if deadline else None
            for fut in as_completed(futures, timeout=timeout):
                try:
                    snap.update(fut.result() or {})
                except Exception as exc:  # noqa: BLE001
                    log.debug("quote future failed", extra={"err": str(exc)})
                done += 1
                if on_progress:
                    on_progress(done, len(chunks))
        except TimeoutError:
            log.info("snapshot budget spent — using partial coverage",
                     extra={"chunks_done": done, "of": len(chunks), "rows": len(snap)})
        finally:
            for fut in futures:
                fut.cancel()
            pool.shutdown(wait=False)
    except Exception as exc:  # noqa: BLE001 — pool creation/shutdown
        log.warning("snapshot pool failed", extra={"err": str(exc)})

    log.info("market snapshot", extra={"requested": len(tickers), "got": len(snap),
                                       "requests": len(chunks), "chunks_done": done})
    return snap
