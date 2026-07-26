"""Cheap whole-market prefilter — narrow ~10k tickers to a few hundred BEFORE
paying for per-ticker price history.

The scan's cost is dominated by one HTTP request per ticker for history, and by
compute_technicals (measured ~4.5 ms/ticker, i.e. ~46 s for 10.3k names on one
core). Both scale with the number of names that reach them, so the whole game is
narrowing the set first using only the fields a batched quote snapshot gives us.

Two deliberate safety properties:
  * The gate is applied with a MARGIN, because the snapshot's average volume is
    approximate while the real gate later uses an exact 20-bar average. Being
    loose here means the exact gate downstream stays authoritative.
  * A name with missing data is NEVER silently dropped — it is kept and left for
    the exact technicals to judge.
"""

from __future__ import annotations

# The snapshot's ADV is a provider average over a different window than our exact
# 20-bar one, so gate loosely and let the real gate decide.
PRICE_MARGIN = 0.85
DOLLAR_VOL_MARGIN = 0.50


def liquidity_gate(snapshot: dict[str, dict], *, min_price: float,
                   min_dollar_vol: float) -> list[str]:
    """Tickers that plausibly pass the liquidity gate. Unknown data => kept."""
    keep: list[str] = []
    for ticker, row in snapshot.items():
        if not row:
            keep.append(ticker)          # no data — don't prejudge
            continue
        price = row.get("price")
        if price is not None and price < min_price * PRICE_MARGIN:
            continue
        adv = row.get("avg_dollar_volume")
        if adv is not None and adv < min_dollar_vol * DOLLAR_VOL_MARGIN:
            continue
        keep.append(ticker)
    return keep


def prerank_score(row: dict | None) -> float | None:
    """0-100 proxy for trend_score built only from snapshot fields.

    Mirrors the real trend_score's structure (price vs SMA50/SMA200, the golden
    cross, and position within the 52-week range), which is the majority of its
    weight. Returns None when the inputs are missing so the caller can keep the
    name rather than rank it on nothing.
    """
    if not row:
        return None
    price = row.get("price")
    if price is None:
        return None
    sma50, sma200 = row.get("sma_50"), row.get("sma_200")
    hi, lo = row.get("high_52w"), row.get("low_52w")
    if sma50 is None and sma200 is None and hi is None:
        return None

    score = 0.0
    if sma50 is not None and price > sma50:
        score += 18
    if sma200 is not None and price > sma200:
        score += 18
    if sma50 is not None and sma200 is not None and sma50 > sma200:
        score += 14
    if hi is not None and hi > 0:
        # proximity to the 52-week high (within 25% of it earns most of this)
        score += 20 * max(0.0, min(1.0, 1.0 - (hi - price) / (hi * 0.25))) if price <= hi else 20
    if lo is not None and lo > 0 and hi is not None and hi > lo:
        score += 12 * max(0.0, min(1.0, (price - lo) / (hi - lo)))
    # real 12-month momentum when the snapshot carries it (-20%..+60% -> 0..18)
    r52 = row.get("return_52w")
    if r52 is not None:
        score += 18 * max(0.0, min(1.0, (r52 + 0.20) / 0.80))
    return round(min(100.0, score), 2)


def prerank(snapshot: dict[str, dict], tickers: list[str], *, keep: int) -> list[str]:
    """Top `keep` tickers by the cheap proxy, plus every unrankable name.

    Names we cannot score (missing SMA/52w fields) are appended rather than
    dropped — the expensive-but-exact path gets the final say on them.
    """
    scored: list[tuple[float, str]] = []
    unrankable: list[str] = []
    for t in tickers:
        s = prerank_score(snapshot.get(t))
        if s is None:
            unrankable.append(t)
        else:
            scored.append((s, t))
    scored.sort(reverse=True)
    chosen = [t for _, t in scored[:keep]]
    # keep the unrankable tail bounded so a thin snapshot can't undo the prefilter
    return chosen + unrankable[: max(0, keep // 2)]


def snapshot_tech(row: dict | None) -> dict | None:
    """Technicals derived ONLY from the batched snapshot — zero per-ticker requests.

    The Yahoo *quote* endpoint batches (~10 requests for the liquid universe), and
    it already carries price, 50/200-day averages, the 52-week range and the
    52-week return. That is enough for a real trend read. What it cannot give is
    anything needing a price *series* — RSI, MACD, ATR, realised volatility,
    drawdown — so those stay None rather than being guessed, and `_avg` in
    scoring renormalises around the components that are present.

    `extra.approx` marks the row so a caller can label it and prefer an exact
    row whenever one exists. Returns None when the snapshot has no usable price.
    """
    if not row or row.get("price") is None:
        return None
    price = row["price"]
    sma50, sma200 = row.get("sma_50"), row.get("sma_200")
    hi, lo = row.get("high_52w"), row.get("low_52w")
    return {
        "last_price": price,
        # series-only indicators: unknowable from a quote, so left null
        "rsi": None, "macd": None, "macd_signal": None, "macd_hist": None,
        "sma_20": None, "ema_12": None, "ema_26": None,
        "bb_upper": None, "bb_mid": None, "bb_lower": None,
        "atr": None, "volatility": None, "drawdown": None,
        "sma_50": sma50,
        "sma_200": sma200,
        # the same 0-100 proxy the prefilter ranks on — structurally the majority
        # of the real trend_score's weight (price vs SMA50/200, golden cross,
        # position in the 52w range, 12m momentum)
        "trend_score": prerank_score(row),
        "momentum": row.get("return_52w"),
        "extra": {
            "avg_dollar_volume": row.get("avg_dollar_volume"),
            "high_52w": hi,
            "low_52w": lo,
            "pct_from_52w_high": (price / hi - 1.0) if (hi and price) else None,
            "return_12m": row.get("return_52w"),
            "return_1m": None, "return_3m": None, "return_6m": None,
            "above_sma50": (price > sma50) if sma50 else None,
            "above_sma200": (price > sma200) if sma200 else None,
            "bars": 0,
            "approx": True,          # derived from the snapshot, not a price series
        },
    }
