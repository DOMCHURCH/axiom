"""Position allocation — split trading capital across the best candidates.

Never all-in on one name. Weights come from confidence, tilted inverse to
volatility, penalized for correlation (redundant names get less), then capped per
name, per sector, and by liquidity, and converted to whole-share positions.
"""

from __future__ import annotations

import math

import numpy as np

MAX_PER_NAME = 0.35
MAX_PER_SECTOR = 0.45
LIQUIDITY_FRACTION = 0.02   # a position shouldn't exceed 2% of avg daily $ volume


def _clamp(x, lo, hi):
    return max(lo, min(hi, x))


def _corr_penalties(candidates: list[dict]) -> dict[int, float]:
    """1.0 = unique; lower = correlated with the rest. Uses recent return series."""
    series = [c.get("returns") for c in candidates]
    n = len(candidates)
    if n < 2 or any(s is None or len(s) < 20 for s in series):
        return {i: 1.0 for i in range(n)}
    L = min(len(s) for s in series)
    mat = np.array([np.asarray(s[-L:], dtype=float) for s in series])
    try:
        corr = np.corrcoef(mat)
    except Exception:
        return {i: 1.0 for i in range(n)}
    penalties = {}
    for i in range(n):
        others = [corr[i][j] for j in range(n) if j != i and math.isfinite(corr[i][j])]
        avg = float(np.mean(others)) if others else 0.0
        penalties[i] = _clamp(1.0 - 0.5 * max(0.0, avg), 0.5, 1.0)
    return penalties


def _apply_caps(weights: list[float], sectors: list[str | None]) -> list[float]:
    w = np.array(weights, dtype=float)
    for _ in range(6):
        changed = False
        # per-name cap
        over = w > MAX_PER_NAME
        if over.any():
            excess = float((w[over] - MAX_PER_NAME).sum())
            w[over] = MAX_PER_NAME
            free = ~over & (w > 0)
            if free.any() and excess > 1e-9:
                w[free] += excess * (w[free] / w[free].sum())
                changed = True
        # per-sector cap
        for sec in set(s for s in sectors if s):
            idx = [i for i, s in enumerate(sectors) if s == sec]
            tot = float(w[idx].sum())
            if tot > MAX_PER_SECTOR + 1e-9:
                scale = MAX_PER_SECTOR / tot
                excess = tot - MAX_PER_SECTOR
                for i in idx:
                    w[i] *= scale
                out = [i for i in range(len(w)) if sectors[i] != sec]
                if out and sum(w[i] for i in out) > 0:
                    base = sum(w[i] for i in out)
                    for i in out:
                        w[i] += excess * (w[i] / base)
                    changed = True
        if not changed:
            break
    s = w.sum()
    return list(w / s) if s > 0 else list(w)


def allocate(capital: float, candidates: list[dict], *, max_positions: int = 6) -> dict:
    """`candidates`: dicts with ticker, confidence, atr_pct, sector, price,
    avg_dollar_volume, returns (recent daily returns list, optional). Sorted best-first."""
    picks = [c for c in candidates if c.get("price")][:max_positions]
    if not picks:
        return {"capital": capital, "positions": [], "cash": capital, "sector_exposure": {}}

    penalties = _corr_penalties(picks)
    raw = []
    for i, c in enumerate(picks):
        conf = max((c.get("confidence") or 0) - 25, 1)
        # risk-based sizing: use the trade's actual stop distance (stop_pct) as the
        # risk measure so tighter-stop trades earn more capital at comparable $ risk
        # (falls back to ATR%). Kaufman: individual-trade risk / volatility parity.
        risk = c.get("stop_pct") or c.get("atr_pct") or 0.03
        inv_risk = _clamp(0.03 / max(risk, 0.008), 0.4, 1.6)
        raw.append(conf * inv_risk * penalties.get(i, 1.0))
    total = sum(raw) or 1.0
    weights = [r / total for r in raw]

    # liquidity cap (matters only for large capital)
    for i, c in enumerate(picks):
        adv = c.get("avg_dollar_volume")
        if adv:
            cap_w = (LIQUIDITY_FRACTION * adv) / capital
            weights[i] = min(weights[i], cap_w)
    s = sum(weights)
    weights = [w / s for w in weights] if s > 0 else weights

    weights = [float(x) for x in _apply_caps(weights, [c.get("sector") for c in picks])]

    # Deploy the FULL target dollar amount into each name using fractional shares
    # (every major broker supports them now). Whole-share rounding on $300+ stocks
    # was leaving most of a small account in cash — so we report both: the exact
    # dollars to put in, the fractional share count that deploys it, and the whole-
    # share fallback for anyone who can't trade fractions.
    positions = []
    invested = 0.0
    whole_invested = 0.0
    sector_exp: dict[str, float] = {}
    for c, w in zip(picks, weights):
        dollars = w * capital
        price = c["price"]
        frac = round(dollars / price, 4) if price else 0.0
        whole = int(math.floor(dollars / price)) if price else 0
        invested += dollars
        whole_invested += whole * (price or 0)
        sec = c.get("sector") or "Unknown"
        sector_exp[sec] = round(sector_exp.get(sec, 0.0) + w, 4)
        positions.append({
            "ticker": c["ticker"], "weight_pct": round(w * 100, 1),
            "target_dollars": round(dollars, 2), "shares": frac,
            "whole_shares": whole, "invested_dollars": round(dollars, 2),
            "price": round(price, 2), "confidence": c.get("confidence"), "sector": sec,
        })
    return {
        "capital": round(capital, 2),
        "invested": round(invested, 2),
        "cash": round(capital - invested, 2),
        "whole_share_invested": round(whole_invested, 2),
        "whole_share_cash": round(capital - whole_invested, 2),
        "positions": positions,
        "sector_exposure": {k: round(v * 100, 1) for k, v in sector_exp.items()},
    }
