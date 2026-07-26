"""Trading strategy signals — how well a stock fits each short-term setup.

Each strategy returns a 0-100 fit score from daily OHLCV (+ the technicals dict
and an optional benchmark for relative strength). All deterministic Python; the
AI only narrates these later. Missing inputs yield None, never a fabricated score.

Price-based strategies live here. Earnings/news/sector momentum are layered on
top for the top candidates during enrichment (Finnhub/GDELT), not per-universe.
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd

from app.quant.scoring import _clamp, inv, scale
from app.quant.technical import atr, bollinger, rsi

STRATEGIES = [
    "momentum", "breakout", "trend_following", "pullback", "mean_reversion",
    "gap", "volume_breakout", "ma_crossover", "volatility_expansion",
    "support_resistance_break", "relative_strength",
    # layered during enrichment for top names:
    "earnings_momentum", "news_momentum", "sector_rotation",
]


def _f(x) -> float | None:
    if x is None:
        return None
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def _price(df: pd.DataFrame) -> pd.Series:
    col = "adj_close" if "adj_close" in df and df["adj_close"].notna().any() else "close"
    return df[col].astype(float)


def _ret(series: pd.Series, n: int) -> float | None:
    if len(series) <= n or series.iloc[-n - 1] == 0:
        return None
    return _f(series.iloc[-1] / series.iloc[-n - 1] - 1.0)


def compute_features(df: pd.DataFrame) -> dict:
    """Extra price-derived features the strategies (and setups) need."""
    close = _price(df)
    high, low = df["high"].astype(float), df["low"].astype(float)
    vol = df.get("volume")
    last = _f(close.iloc[-1])

    hh20 = _f(high.rolling(20).max().iloc[-1])
    ll20 = _f(low.rolling(20).min().iloc[-1])
    hh55 = _f(high.rolling(55).max().iloc[-1]) if len(df) >= 55 else None
    ll10 = _f(low.rolling(10).min().iloc[-1])

    prev_close = _f(close.iloc[-2]) if len(close) > 1 else None
    open_last = _f(df["open"].astype(float).iloc[-1])
    gap_pct = _f(open_last / prev_close - 1.0) if (open_last and prev_close) else None

    vol_ratio = None
    if vol is not None and len(vol) >= 20:
        avg20 = _f(vol.rolling(20).mean().iloc[-1])
        vol_ratio = _f(float(vol.iloc[-1]) / avg20) if avg20 else None

    bb_u, bb_m, bb_l = bollinger(close)
    bb_width = None
    bb_width_prev = None
    if _f(bb_m.iloc[-1]):
        bb_width = _f((bb_u.iloc[-1] - bb_l.iloc[-1]) / bb_m.iloc[-1])
        if len(bb_m) > 20 and _f(bb_m.iloc[-21]):
            bb_width_prev = _f((bb_u.iloc[-21] - bb_l.iloc[-21]) / bb_m.iloc[-21])

    atr_last = _f(atr(df).iloc[-1])
    atr_pct = _f(atr_last / last) if (atr_last and last) else None

    # --- pivot points (latest bar) -> next-session support/resistance ---
    ph, plw, pcl = _f(high.iloc[-1]), _f(low.iloc[-1]), _f(df["close"].astype(float).iloc[-1])
    pivot = r1 = s1 = r2 = s2 = None
    if ph is not None and plw is not None and pcl is not None:
        pivot = (ph + plw + pcl) / 3.0
        r1, s1 = 2 * pivot - plw, 2 * pivot - ph
        r2, s2 = pivot + (ph - plw), pivot - (ph - plw)
    don_hi = _f(high.rolling(20).max().iloc[-1])
    don_lo = _f(low.rolling(20).min().iloc[-1])

    # --- higher-timeframe regime (trade with the bigger trend; Elder) ---
    s50 = _f(close.rolling(50).mean().iloc[-1]) if len(df) >= 50 else None
    s200 = _f(close.rolling(200).mean().iloc[-1]) if len(df) >= 200 else None
    regime = "neutral"
    if last and s50 and s200:
        regime = "up" if last > s50 > s200 else "down" if last < s50 < s200 else "neutral"

    # --- risk-adjusted momentum (mean / stdev of returns) ---
    rets = close.pct_change().dropna()
    rw = rets.iloc[-63:] if len(rets) >= 63 else rets
    risk_adj_mom = _f(rw.mean() / rw.std()) if (len(rw) > 5 and rw.std()) else None

    return {
        "last": last, "prev_close": prev_close,
        "high_20": hh20, "low_20": ll20, "high_55": hh55, "low_10": ll10,
        "dist_from_high20": _f(last / hh20 - 1.0) if (last and hh20) else None,
        "dist_from_low20": _f(last / ll20 - 1.0) if (last and ll20) else None,
        "gap_pct": gap_pct, "vol_ratio": vol_ratio,
        "bb_width": bb_width, "bb_width_prev": bb_width_prev,
        "atr": atr_last, "atr_pct": atr_pct,
        "sma20": _f(close.rolling(20).mean().iloc[-1]), "sma50": s50, "sma200": s200,
        "pivot": pivot, "r1": r1, "s1": s1, "r2": r2, "s2": s2,
        "donchian_high": don_hi, "donchian_low": don_lo,
        "regime": regime, "risk_adj_mom": risk_adj_mom,
    }


def compute_strategy_signals(df: pd.DataFrame, tech: dict | None = None,
                             benchmark: dict | None = None) -> dict:
    """Return {signals: {name: 0-100|None}, features: {...}}."""
    if df is None or df.empty or len(df) < 40:
        return {"signals": {}, "features": {}}
    df = df.sort_index()
    tech = tech or {}
    fx = compute_features(df)
    close = _price(df)
    rsi_v = tech.get("rsi")
    if rsi_v is None:
        rsi_v = _f(rsi(close).iloc[-1])

    last, sma20, sma50, sma200 = fx["last"], fx["sma20"], fx["sma50"], fx["sma200"]
    r1m, r3m, r6m = _ret(close, 21), _ret(close, 63), _ret(close, 126)
    above50 = bool(last and sma50 and last > sma50)
    above200 = bool(last and sma200 and last > sma200)
    uptrend = bool(sma50 and sma200 and sma50 > sma200)

    sig: dict[str, float | None] = {}

    # 1. Momentum — sustained strength, not overheated
    mom_parts = [scale(r1m, -0.05, 0.20), scale(r3m, -0.05, 0.40), scale(r6m, -0.10, 0.60)]
    mom_parts = [p for p in mom_parts if p is not None]
    mom = sum(mom_parts) / len(mom_parts) if mom_parts else None
    if mom is not None:
        if above50: mom = _clamp(mom + 8)
        if rsi_v is not None and rsi_v > 82: mom = _clamp(mom - 20)  # overheated
    sig["momentum"] = None if mom is None else round(mom, 2)

    # 2. Breakout — pushing the 20/55-day high on volume
    dh = fx["dist_from_high20"]
    brk = None
    if dh is not None:
        brk = inv(abs(dh), 0.0, 0.08)  # closer to (or above) high = higher
        if dh >= 0: brk = _clamp((brk or 0) + 12)  # new high
        if fx["vol_ratio"]: brk = _clamp((brk or 0) + scale(fx["vol_ratio"], 1.0, 2.5) * 0.25)
    sig["breakout"] = None if brk is None else round(brk, 2)

    # 3. Trend following — MA stacking + slope (reuse trend_score if present)
    trend = tech.get("trend_score")
    if trend is None:
        t = 0.0
        if above50: t += 35
        if above200: t += 30
        if uptrend: t += 25
        if r3m and r3m > 0: t += 10
        trend = t
    sig["trend_following"] = round(_clamp(trend), 2)

    # 4. Pullback — uptrend, price dipped toward a rising MA, RSI cooled
    pb = None
    if uptrend and above200 and sma20:
        dist20 = abs(last / sma20 - 1.0)
        near = inv(dist20, 0.0, 0.06)
        rsi_cool = 100.0 if (rsi_v is not None and 38 <= rsi_v <= 55) else (
            scale(rsi_v, 30, 45) if rsi_v is not None else None)
        parts = [p for p in (near, rsi_cool) if p is not None]
        pb = sum(parts) / len(parts) if parts else None
    sig["pullback"] = None if pb is None else round(pb, 2)

    # 5. Mean reversion — oversold snapback candidate
    mr = None
    if rsi_v is not None:
        mr = inv(rsi_v, 20, 45)  # more oversold = higher
        if fx["bb_width"] and last and fx.get("sma20"):
            _, _, bb_l = bollinger(close)
            if last <= _f(bb_l.iloc[-1] or last):
                mr = _clamp((mr or 0) + 15)
        if above200:  # bounce within an uptrend is higher quality
            mr = _clamp((mr or 0) + 10)
    sig["mean_reversion"] = None if mr is None else round(mr, 2)

    # 6. Gap — meaningful gap holding
    gap = None
    if fx["gap_pct"] is not None:
        g = abs(fx["gap_pct"])
        gap = scale(g, 0.01, 0.06)
        if fx["gap_pct"] > 0 and last and fx["prev_close"] and last > fx["prev_close"]:
            gap = _clamp((gap or 0) + 15)  # gap up and holding green
    sig["gap"] = None if gap is None else round(gap, 2)

    # 7. Volume breakout — expansion with price up
    vb = None
    if fx["vol_ratio"] is not None:
        vb = scale(fx["vol_ratio"], 1.2, 3.0)
        if fx["prev_close"] and last and last > fx["prev_close"]:
            vb = _clamp((vb or 0) + 10)
    sig["volume_breakout"] = None if vb is None else round(vb, 2)

    # 8. MA crossover — fresh 20/50 bullish cross
    xo = None
    if len(df) >= 55:
        s20 = close.rolling(20).mean()
        s50 = close.rolling(50).mean()
        diff = (s20 - s50).dropna()
        if len(diff) > 6:
            recent_cross = any(diff.iloc[-k - 1] <= 0 < diff.iloc[-k] for k in range(1, 6))
            xo = 90.0 if (recent_cross and diff.iloc[-1] > 0) else (
                55.0 if diff.iloc[-1] > 0 else 20.0)
    sig["ma_crossover"] = None if xo is None else round(xo, 2)

    # 9. Volatility expansion — squeeze now widening
    ve = None
    if fx["bb_width"] is not None and fx["bb_width_prev"] is not None and fx["bb_width_prev"] > 0:
        expansion = fx["bb_width"] / fx["bb_width_prev"] - 1.0
        ve = scale(expansion, 0.0, 0.8)
    sig["volatility_expansion"] = None if ve is None else round(ve, 2)

    # 10. Support/resistance break — closing above prior resistance
    srb = None
    if fx["high_20"] and last:
        prior_high = _f(df["high"].astype(float).iloc[-25:-2].max()) if len(df) > 25 else fx["high_20"]
        if prior_high:
            srb = 88.0 if last > prior_high else inv(abs(last / prior_high - 1.0), 0.0, 0.05)
    sig["support_resistance_break"] = None if srb is None else round(srb, 2)

    # 11. Relative strength — outperforming the benchmark
    rs = None
    if benchmark:
        parts = []
        for k, n in (("return_1m", "r1m"), ("return_3m", "r3m")):
            b = benchmark.get(k)
            s = {"r1m": r1m, "r3m": r3m}[n]
            if b is not None and s is not None:
                parts.append(scale(s - b, -0.10, 0.20))
        rs = sum(parts) / len(parts) if parts else None
    sig["relative_strength"] = None if rs is None else round(rs, 2)

    return {"signals": sig, "features": fx}
