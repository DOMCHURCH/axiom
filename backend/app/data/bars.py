"""Daily bars with provider failover — the price-history path for the scanner.

Why this module exists. The Yahoo chart endpoint takes the symbol in the URL
path, so it costs one request per ticker; its *quote* endpoint batches, which is
why the whole-market snapshot succeeds while price history is the stage that
breaks. Worse, Yahoo throttles that volume from a datacenter IP by **hanging**
the request rather than returning an error, and the penalty outlives any single
scan. Bounding each fetch (see `scanner._call_bounded`) stops a hang freezing the
scan, but it can't produce prices — once Yahoo is blocking the IP range, no
amount of concurrency tuning gets history out of it.

So this is the failover. Providers are tried in order of what a throttle costs:

  yahoo    unlimited + free, but 1 request/ticker and hangs under throttle
  polygon  1 request per *market day* regardless of ticker count — the only
           endpoint here that doesn't scale with universe size. At the free
           5/min tier a year of history is ~260 requests ≈ 50 minutes, so it is
           gated behind a tier that can actually sustain it (_polygon_available).
  fmp      1 request/ticker like Yahoo, but rate-limited and hard-timeouted at
           8s, so it fails fast instead of stalling. 250/day, so it covers a
           deep stage's few hundred names roughly once a day.

Yahoo keeps its place at the front because it's free and unmetered when it works.
The difference from before is that a throttled Yahoo now *steps aside* — a
circuit breaker takes it out of rotation for a cooldown so the rest of the scan
goes straight to a provider that answers, instead of re-earning the same hang
batch after batch.
"""

from __future__ import annotations

import time
from datetime import date, timedelta

import pandas as pd

from app.config import settings
from app.core.logging import get_logger
from app.core.ratelimit import BudgetExhausted
from app.data import fmp, polygon, yahoo

log = get_logger("bars")

COLUMNS = ["open", "high", "low", "close", "adj_close", "volume"]

# Once Yahoo has returned nothing this many times in a row it is presumed to be
# throttling this IP, not merely unlucky. The penalty is IP-scoped and lasts well
# beyond one scan, so retrying inside the window just spends the stage's time
# budget to arrive at the same empty result.
_BREAKER_THRESHOLD = 3
_BREAKER_COOLDOWN = 15 * 60

_breakers: dict[str, dict] = {}
_stats: dict[str, int] = {}


def _breaker_open(name: str) -> bool:
    b = _breakers.get(name)
    return bool(b and b["until"] > time.time())


def _record(name: str, ok: bool) -> None:
    if ok:
        _breakers.pop(name, None)
        return
    b = _breakers.setdefault(name, {"fails": 0, "until": 0.0})
    b["fails"] += 1
    if b["fails"] >= _BREAKER_THRESHOLD:
        b["until"] = time.time() + _BREAKER_COOLDOWN
        log.warning("provider tripped out of rotation — presumed throttling",
                    extra={"provider": name, "cooldown_s": _BREAKER_COOLDOWN})


def stats() -> dict[str, int]:
    """Bars served per provider this process. Lets a scan report what answered."""
    return dict(_stats)


def reset_breakers() -> None:
    """Clear cooldowns — for an explicit user-triggered retry."""
    _breakers.clear()


def _period_days(period: str) -> int:
    """Trading days to request for a yfinance-style period string."""
    p = (period or "1y").strip().lower()
    if p.endswith("y"):
        try:
            return max(1, int(float(p[:-1]) * 260))
        except ValueError:
            return 260
    if p.endswith("mo"):
        try:
            return max(1, int(float(p[:-2]) * 22))
        except ValueError:
            return 66
    if p.endswith("d"):
        try:
            return max(1, int(p[:-1]))
        except ValueError:
            return 260
    return 260


def _frame(rows: list[dict]) -> pd.DataFrame:
    """Build a scanner-shaped frame: COLUMNS, tz-naive DatetimeIndex named 'ts'."""
    if not rows:
        return pd.DataFrame(columns=COLUMNS)
    df = pd.DataFrame(rows)
    if "ts" not in df.columns:
        return pd.DataFrame(columns=COLUMNS)
    for col in COLUMNS:
        if col not in df.columns:
            df[col] = pd.NA
    df = df[["ts", *COLUMNS]].copy()
    idx = pd.to_datetime(df.pop("ts"), errors="coerce")
    if getattr(idx, "dt", None) is not None and idx.dt.tz is not None:
        idx = idx.dt.tz_localize(None)
    df.index = pd.DatetimeIndex(idx)
    df.index.name = "ts"
    df = df[~df.index.isna()]
    df = df.dropna(how="all").sort_index()
    # compute_technicals does arithmetic on these — object dtype would break it.
    for col in COLUMNS:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    return df


# ── Providers ────────────────────────────────────────────────────────────────
# Each returns {TICKER: DataFrame} for whatever it could resolve. A ticker the
# provider simply doesn't cover is omitted — that's a miss to pass down the
# chain, not a provider failure.

def _from_yahoo(tickers: list[str], period: str) -> dict[str, pd.DataFrame]:
    return {t: df for t, df in (yahoo.download_batch(tickers, period=period) or {}).items()
            if df is not None and not df.empty}


def _yahoo_available(_days: int) -> bool:
    return True


def _fmp_available(_days: int) -> bool:
    return bool(settings.fmp_api_key) and fmp.budget_remaining() > 0


def _polygon_available(days: int) -> bool:
    """True when the configured Polygon tier could realistically build `days`.

    Grouped-daily is one request per market day, so a year of history is ~260
    requests. The free 5/min tier would need ~50 minutes of wall clock for that —
    fine as a background warm, useless inside a scan stage measured in seconds.
    Rather than half-fill history and hand the quant engine a frame too short to
    compute a 200-day SMA on, only attempt this when the per-minute allowance can
    sustain it, or when the days are already cached (a repeat scan).
    """
    if not settings.polygon_api_key:
        return False
    return settings.polygon_per_min >= 60 or days <= settings.polygon_per_min


def _from_polygon(tickers: list[str], period: str) -> dict[str, pd.DataFrame]:
    """Assemble per-ticker history from whole-market grouped-daily bars.

    Cost is one request per market day for ALL tickers at once, so unlike Yahoo
    and FMP this does not get more expensive as the universe grows. Only the
    requested tickers are retained, which keeps memory bounded — the whole
    market's year of bars would be ~100MB+ and this container is small.
    """
    days = _period_days(period)
    wanted = {t.upper() for t in tickers}
    rows: dict[str, list[dict]] = {t: [] for t in wanted}
    day = date.today()
    seen = 0
    misses = 0
    while seen < days and misses < 5:
        if day.weekday() < 5:  # skip weekends without spending a request
            grouped = polygon.grouped_daily(day.isoformat())
            if grouped is None:  # throttled or failed — stop, don't grind
                break
            if grouped:
                seen += 1
                misses = 0
                ts = day.isoformat()
                for t in wanted & grouped.keys():
                    rows[t].append({"ts": ts, **grouped[t]})
            else:
                misses += 1  # holiday
        day -= timedelta(days=1)
    out = {}
    for t, r in rows.items():
        df = _frame(r)
        if not df.empty:
            # grouped-daily is already split/dividend adjusted (adjusted=true)
            df["adj_close"] = df["close"]
            out[t] = df
    return out


def _from_fmp(tickers: list[str], period: str) -> dict[str, pd.DataFrame]:
    """Per-ticker history, bounded by the remaining daily budget."""
    if not settings.fmp_api_key:
        return {}
    days = _period_days(period)
    out: dict[str, pd.DataFrame] = {}
    for t in tickers:
        if fmp.budget_remaining() <= 0:
            log.info("fmp budget spent — stopping bars failover",
                     extra={"resolved": len(out), "of": len(tickers)})
            break
        try:
            raw = fmp.historical_prices(t, days=days)
        except BudgetExhausted:
            break
        except Exception as exc:  # noqa: BLE001
            log.debug("fmp bars failed", extra={"ticker": t, "err": str(exc)})
            continue
        if not raw:
            continue
        df = _frame([{
            "ts": r.get("date"), "open": r.get("open"), "high": r.get("high"),
            "low": r.get("low"), "close": r.get("close"),
            "adj_close": r.get("adjClose", r.get("close")), "volume": r.get("volume"),
        } for r in raw])
        if not df.empty:
            out[t.upper()] = df
    return out


# (name, fetch, is_available). `is_available` is what keeps an unconfigured or
# structurally-unsuitable provider from being counted as a *failure*: skipping it
# must not accumulate against its circuit breaker, or a deploy with no Polygon key
# would permanently "cool down" a provider it never actually called.
_CHAIN = (
    ("yahoo", _from_yahoo, _yahoo_available),
    ("polygon", _from_polygon, _polygon_available),
    ("fmp", _from_fmp, _fmp_available),
)


def fetch_batch(tickers: list[str], period: str = "1y") -> dict[str, pd.DataFrame]:
    """Daily bars for a batch, trying each provider until the batch is covered.

    Never raises: a batch nothing could resolve comes back empty, which the
    scanner already treats as a throttle signal. Frames are scanner-shaped
    (COLUMNS, tz-naive 'ts' index) whichever provider produced them.
    """
    if not tickers:
        return {}
    forced = (settings.scan_bars_provider or "auto").strip().lower()
    days = _period_days(period)
    resolved: dict[str, pd.DataFrame] = {}

    for name, fn, available in _CHAIN:
        if forced != "auto" and name != forced:
            continue
        missing = [t for t in tickers if t.upper() not in resolved]
        if not missing:
            break
        # Skipped-because-unavailable and skipped-because-cooling-down both bypass
        # the breaker entirely — neither is evidence about the provider's health.
        if not available(days) or _breaker_open(name):
            continue
        try:
            got = fn(missing, period)
        except Exception as exc:  # noqa: BLE001 — a bad provider must not kill the scan
            log.warning("bars provider failed", extra={"provider": name, "err": str(exc)})
            _record(name, ok=False)
            continue
        # An *available* provider returning nothing for a whole batch is the
        # throttle signature (a hung Yahoo request, bounded out, yields {}), so
        # that does count against the breaker.
        _record(name, ok=bool(got))
        if got:
            for t, df in got.items():
                resolved[t.upper()] = df
            _stats[name] = _stats.get(name, 0) + len(got)
            log.info("bars resolved", extra={"provider": name, "got": len(got),
                                             "requested": len(missing)})
    return resolved


def fetch_bulk(tickers: list[str], period: str = "1y",
               batch_size: int = 150) -> dict[str, pd.DataFrame]:
    """`fetch_batch` over a large list, chunked.

    Yahoo's batched download puts every symbol in one URL, so an unchunked call
    for a few hundred names silently overruns its URL limit and returns nothing —
    which the breaker would then read as a throttle. Chunking keeps each request
    inside that limit (this is what yahoo.fetch_prices_bulk did).
    """
    out: dict[str, pd.DataFrame] = {}
    for i in range(0, len(tickers), max(1, batch_size)):
        out.update(fetch_batch(tickers[i:i + batch_size], period))
    return out
