"""Trade setup generator — entry zone, ATR-based stop, two profit targets, and
risk metrics, tuned to the holding period. Deterministic Python.
"""

from __future__ import annotations

from app.quant.trade_scoring import HORIZON_DAYS

# stop distance (ATR multiples) and profit-target R-multiples, per horizon
STOP_ATR = {"intraday": 1.0, "1-3d": 1.3, "1w": 1.8, "2w": 2.2, "1m": 2.8}
TARGET_R = {"intraday": (1.2, 2.2), "1-3d": (1.5, 2.8), "1w": (1.8, 3.2),
            "2w": (2.0, 3.8), "1m": (2.5, 4.5)}


def _round(x, d=2):
    return None if x is None else round(float(x), d)


def risk_level(atr_pct: float | None) -> str:
    if atr_pct is None:
        return "medium"
    if atr_pct < 0.03:
        return "low"
    if atr_pct < 0.06:
        return "medium"
    return "high"


def generate_setup(features: dict, horizon: str = "1w") -> dict | None:
    last = features.get("last")
    if not last:
        return None
    atr = features.get("atr")
    atr_pct = features.get("atr_pct")
    if not atr:  # fall back to a % of price if ATR unavailable
        atr = last * (atr_pct or 0.02)

    stop_mult = STOP_ATR.get(horizon, 1.8)
    r1m, r2m = TARGET_R.get(horizon, (1.8, 3.2))

    entry_low = last - 0.3 * atr
    entry_high = last + 0.4 * atr

    # Stop: ATR-based, but tightened to sit just under a REAL support (pivot S1 or
    # the recent swing low) when one is nearer than the ATR stop yet not too tight.
    atr_stop = last - stop_mult * atr
    supports = [sp * 0.997 for sp in (features.get("s1"), features.get("low_10"))
                if sp and atr_stop <= sp * 0.997 <= last - 0.5 * atr]
    stop = max(supports) if supports else atr_stop
    risk_ps = max(last - stop, 1e-6)

    # Targets: ATR R-multiples, but snapped to real resistance (pivot R1/R2 or the
    # Donchian high) when one sits within a sensible distance -> cleaner exits.
    target_1 = last + r1m * risk_ps
    target_2 = last + r2m * risk_ps
    res = sorted(x for x in (features.get("r1"), features.get("r2"), features.get("donchian_high"))
                 if x and x > last + 1.2 * risk_ps)
    if res:
        near = [r for r in res if (r - last) / risk_ps <= r1m * 1.5]
        if near:
            target_1 = near[0]
        far = [r for r in res if r > target_1 and (r - last) / risk_ps <= r2m * 1.5]
        target_2 = far[0] if far else max(target_2, target_1 + risk_ps)

    return {
        "current_price": _round(last),
        "entry_low": _round(entry_low),
        "entry_high": _round(entry_high),
        "stop_loss": _round(stop),
        "target_1": _round(target_1),
        "target_2": _round(target_2),
        "risk_per_share": _round(risk_ps),
        "risk_reward_1": _round((target_1 - last) / risk_ps),
        "risk_reward_2": _round((target_2 - last) / risk_ps),
        "risk_level": risk_level(atr_pct),
        "atr_pct": _round(atr_pct, 4),
        "holding_days": HORIZON_DAYS.get(horizon, 5),
        "support": _round(features.get("s1") or features.get("low_20")),
        "resistance": _round(features.get("r1") or features.get("high_20")),
        "pivot": _round(features.get("pivot")),
        "r1": _round(features.get("r1")), "r2": _round(features.get("r2")),
        "s1": _round(features.get("s1")), "s2": _round(features.get("s2")),
        "donchian_high": _round(features.get("donchian_high")),
        "regime": features.get("regime"),
    }
