"""Scoring models — map deterministic metrics to six 0-100 sub-scores and a
weighted composite, then a recommendation label. All judgment is explicit and
auditable (breakdown is persisted); the AI does not produce these numbers.

Sub-scores: technical, fundamental, growth, value, quality, risk (risk: higher = safer).
"""

from __future__ import annotations

DEFAULT_WEIGHTS = {
    "technical": 0.20,
    "fundamental": 0.20,
    "growth": 0.20,
    "value": 0.15,
    "quality": 0.15,
    "risk": 0.10,
}

RATINGS = ["Strong Buy", "Buy", "Hold", "Watch", "Avoid"]


def _clamp(x: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, x))


def scale(v, lo, hi) -> float | None:
    """Linear map lo->0, hi->100 (higher input = higher score)."""
    if v is None:
        return None
    return _clamp((v - lo) / (hi - lo) * 100.0)


def inv(v, lo, hi) -> float | None:
    """Linear map lo->100, hi->0 (lower input = higher score)."""
    if v is None:
        return None
    return _clamp((hi - v) / (hi - lo) * 100.0)


def _avg(pairs: list[tuple[float | None, float]]) -> float | None:
    """Weighted average ignoring None components, renormalizing weights."""
    num = den = 0.0
    for value, weight in pairs:
        if value is not None:
            num += value * weight
            den += weight
    return round(num / den, 2) if den > 0 else None


# --------------------------------------------------------------------------- technical
def technical_score(tech: dict | None) -> float | None:
    if not tech:
        return None
    rsi = tech.get("rsi")
    rsi_component = None
    if rsi is not None:
        # reward the 45-65 zone, penalize overbought/oversold extremes
        if 45 <= rsi <= 65:
            rsi_component = 100.0
        elif rsi < 45:
            rsi_component = scale(rsi, 20, 45)
        else:
            rsi_component = inv(rsi, 65, 90)
    macd_component = None
    if tech.get("macd_hist") is not None:
        macd_component = 100.0 if tech["macd_hist"] > 0 else 30.0
    pct_high = (tech.get("extra") or {}).get("pct_from_52w_high")
    near_high = inv(pct_high, -0.5, 0.0) if pct_high is not None else None  # closer to high = higher

    return _avg([
        (tech.get("trend_score"), 0.40),
        (scale(tech.get("momentum"), -0.30, 0.50), 0.25),
        (rsi_component, 0.15),
        (macd_component, 0.10),
        (near_high, 0.10),
    ])


# --------------------------------------------------------------------------- fundamental
def fundamental_score(f: dict | None) -> float | None:
    if not f:
        return None
    fcf_pos = 100.0 if (f.get("free_cash_flow") or 0) > 0 else 20.0 if f.get("free_cash_flow") is not None else None
    return _avg([
        (scale(f.get("net_margin"), 0.0, 0.25), 0.25),
        (scale(f.get("operating_margin"), 0.0, 0.30), 0.20),
        (scale(f.get("roic"), 0.0, 0.25), 0.20),
        (scale(f.get("roe"), 0.0, 0.30), 0.15),
        (fcf_pos, 0.10),
        (inv(f.get("debt_to_equity"), 0.0, 2.5), 0.10),
    ])


# --------------------------------------------------------------------------- growth
def growth_score(f: dict | None) -> float | None:
    if not f:
        return None
    return _avg([
        (scale(f.get("revenue_growth"), -0.05, 0.35), 0.35),
        (scale(f.get("earnings_growth"), -0.10, 0.50), 0.30),
        (scale(f.get("eps_growth"), -0.10, 0.50), 0.20),
        (scale(f.get("fcf_growth"), -0.15, 0.50), 0.15),
    ])


# --------------------------------------------------------------------------- value
def value_score(f: dict | None) -> float | None:
    if not f:
        return None
    v = f.get("valuation_metrics") or {}
    peg = v.get("peg")
    peg_component = None
    if peg is not None and peg > 0:
        peg_component = inv(peg, 0.5, 3.0)
    return _avg([
        (inv(v.get("pe"), 8, 45) if (v.get("pe") or 0) > 0 else None, 0.30),
        (inv(v.get("ps"), 0.5, 15), 0.15),
        (inv(v.get("pb"), 0.5, 10), 0.15),
        (inv(v.get("ev_ebitda"), 4, 30) if (v.get("ev_ebitda") or 0) > 0 else None, 0.20),
        (peg_component, 0.10),
        (scale(v.get("fcf_yield"), 0.0, 0.10), 0.10),
    ])


# --------------------------------------------------------------------------- quality
def quality_score(f: dict | None) -> float | None:
    if not f:
        return None
    current = f.get("current_ratio")
    current_component = scale(current, 0.8, 2.5) if current is not None else None
    return _avg([
        (scale(f.get("roic"), 0.05, 0.30), 0.30),
        (scale(f.get("roe"), 0.05, 0.30), 0.20),
        (scale(f.get("gross_margin"), 0.20, 0.70), 0.20),
        (inv(f.get("debt_to_equity"), 0.0, 2.0), 0.15),
        (current_component, 0.15),
    ])


# --------------------------------------------------------------------------- risk (higher = safer)
def risk_score(tech: dict | None, f: dict | None) -> float | None:
    tech = tech or {}
    f = f or {}
    beta = f.get("beta")
    beta_component = inv(abs(beta - 1.0), 0.0, 1.5) if beta is not None else None
    mc = f.get("market_cap")
    size_component = scale(mc, 3e8, 5e10) if mc else None  # bigger cap = steadier
    return _avg([
        (inv(tech.get("volatility"), 0.15, 0.90), 0.30),          # calmer = safer
        (scale(tech.get("drawdown"), -0.60, -0.05), 0.20),        # shallower drawdown = safer
        (inv(f.get("debt_to_equity"), 0.0, 2.5), 0.20),
        (beta_component, 0.15),
        (size_component, 0.15),
    ])


# --------------------------------------------------------------------------- composite
def recommendation(total: float | None, risk: float | None = None) -> str:
    if total is None:
        return "Watch"
    if total >= 80:
        return "Strong Buy"
    if total >= 68:
        return "Buy"
    if total >= 52:
        return "Hold"
    if total >= 38:
        return "Watch"
    return "Avoid"


def compute_scores(tech: dict | None, fund: dict | None,
                   weights: dict | None = None) -> dict:
    """Full scorecard. Missing factors are omitted and weights renormalized."""
    w = {**DEFAULT_WEIGHTS, **(weights or {})}
    subs = {
        "technical": technical_score(tech),
        "fundamental": fundamental_score(fund),
        "growth": growth_score(fund),
        "value": value_score(fund),
        "quality": quality_score(fund),
        "risk": risk_score(tech, fund),
    }
    total = _avg([(subs[k], w[k]) for k in subs])
    rec = recommendation(total, subs["risk"])
    return {
        **{f"{k}_score": subs[k] for k in subs},
        "total_score": total,
        "recommendation": rec,
        "breakdown": {"weights": w, "subs": subs},
    }
