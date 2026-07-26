"""Trading score model — turns strategy signals + context into 8 sub-scores and a
horizon-weighted Overall Trade Score. Replaces the buy-and-hold investment score.

Sub-scores (0-100): momentum, breakout, trend, volume, volatility, fundamental,
sentiment, risk (risk higher = safer). The blend weights change with the intended
holding period (intraday leans on volume/volatility/breakout; 1-month leans on
trend/fundamental).
"""

from __future__ import annotations

from app.quant.scoring import _clamp, fundamental_score, scale

HORIZONS = ["intraday", "1-3d", "1w", "2w", "1m"]
HORIZON_DAYS = {"intraday": 1, "1-3d": 3, "1w": 5, "2w": 10, "1m": 21}
HORIZON_LABEL = {
    "intraday": "Intraday (Day Trade)", "1-3d": "1–3 Days", "1w": "1 Week",
    "2w": "2 Weeks", "1m": "1 Month",
}

# weights over the 8 sub-scores, per holding period
HORIZON_WEIGHTS = {
    "intraday": {"momentum": .18, "breakout": .20, "trend": .06, "volume": .22, "volatility": .14, "fundamental": .02, "sentiment": .08, "risk": .10},
    "1-3d":     {"momentum": .20, "breakout": .20, "trend": .12, "volume": .16, "volatility": .10, "fundamental": .04, "sentiment": .08, "risk": .10},
    "1w":       {"momentum": .20, "breakout": .18, "trend": .16, "volume": .10, "volatility": .08, "fundamental": .08, "sentiment": .10, "risk": .10},
    "2w":       {"momentum": .20, "breakout": .13, "trend": .20, "volume": .08, "volatility": .06, "fundamental": .13, "sentiment": .10, "risk": .10},
    "1m":       {"momentum": .18, "breakout": .10, "trend": .22, "volume": .05, "volatility": .04, "fundamental": .19, "sentiment": .10, "risk": .12},
}

STRATEGY_LABEL = {
    "momentum": "Momentum", "breakout": "Breakout", "trend_following": "Trend Following",
    "pullback": "Pullback Entry", "mean_reversion": "Mean Reversion", "gap": "Gap Trade",
    "volume_breakout": "High-Volume Breakout", "ma_crossover": "MA Crossover",
    "volatility_expansion": "Volatility Expansion", "support_resistance_break": "S/R Break",
    "relative_strength": "Relative Strength", "earnings_momentum": "Earnings Momentum",
    "news_momentum": "News Momentum", "sector_rotation": "Sector Rotation",
}


def _avg(vals: list[float | None]) -> float | None:
    xs = [v for v in vals if v is not None]
    return round(sum(xs) / len(xs), 2) if xs else None


def _sentiment_to_score(sentiment: dict | None) -> float | None:
    if not sentiment or sentiment.get("sentiment_score") is None:
        return None
    # tone in [-1, 1] -> [0, 100]
    return round(_clamp((float(sentiment["sentiment_score"]) + 1.0) * 50.0), 2)


def _risk_score(features: dict, tech: dict | None) -> float | None:
    tech = tech or {}
    atr_pct = features.get("atr_pct")
    dd = tech.get("drawdown")
    adv = (tech.get("extra") or {}).get("avg_dollar_volume")
    parts = []
    if atr_pct is not None:
        parts.append((100 - _clamp((atr_pct - 0.02) / (0.10 - 0.02) * 100), 0.45))
    if dd is not None:
        parts.append((scale(dd, -0.5, -0.03), 0.25))
    if adv is not None:
        parts.append((scale(adv, 2e6, 8e7), 0.30))
    num = sum(v * w for v, w in parts if v is not None)
    den = sum(w for v, w in parts if v is not None)
    return round(num / den, 2) if den else None


def compute_trade_scores(signals: dict, features: dict, tech: dict | None,
                         fund: dict | None, sentiment: dict | None,
                         horizon: str = "1w") -> dict:
    s = signals or {}
    fx = features or {}
    # apply learned per-strategy weights from the backtest (no-op until one is run)
    from app.quant.strategy_weights import load_weights
    _w = load_weights()
    if _w:
        s = {k: (min(100.0, v * _w.get(k, 1.0)) if v is not None else None) for k, v in s.items()}
    subs = {
        "momentum": _avg([s.get("momentum"), s.get("relative_strength"), s.get("earnings_momentum"),
                          scale(fx.get("risk_adj_mom"), -0.05, 0.15)]),
        "breakout": _avg([s.get("breakout"), s.get("support_resistance_break")]),
        "trend": _avg([s.get("trend_following"), s.get("ma_crossover"), s.get("pullback")]),
        "volume": _avg([s.get("volume_breakout"), s.get("gap")]),
        "volatility": _avg([s.get("volatility_expansion"), scale(features.get("atr_pct"), 0.015, 0.06)]),
        "fundamental": fundamental_score(fund),
        "sentiment": _avg([_sentiment_to_score(sentiment), s.get("news_momentum")]),
        "risk": _risk_score(features, tech),
    }

    weights = HORIZON_WEIGHTS.get(horizon, HORIZON_WEIGHTS["1w"])
    num = den = 0.0
    for k, v in subs.items():
        if v is not None:
            num += v * weights[k]
            den += weights[k]
    overall = round(num / den, 2) if den else None

    # regime filter: reward long setups aligned with the higher-timeframe uptrend,
    # penalize going long into a higher-timeframe downtrend (Elder triple-screen).
    regime = fx.get("regime")
    if overall is not None and regime == "up":
        overall = round(min(100.0, overall * 1.05), 2)
    elif overall is not None and regime == "down":
        overall = round(max(0.0, overall * 0.88), 2)

    # primary setup = strongest individual strategy signal
    strat_scores = {k: v for k, v in s.items() if v is not None}
    best_strategy = max(strat_scores, key=strat_scores.get) if strat_scores else None

    # confidence blends the overall score with how many strategies agree
    strong = [v for v in strat_scores.values() if v >= 60]
    breadth = round(100 * len(strong) / max(1, len(strat_scores)), 1) if strat_scores else 0
    confidence = None if overall is None else int(round(0.72 * overall + 0.28 * breadth))

    return {
        "sub_scores": {f"{k}_score": v for k, v in subs.items()},
        "overall_score": overall,
        "confidence": confidence,
        "best_strategy": best_strategy,
        "best_strategy_label": STRATEGY_LABEL.get(best_strategy) if best_strategy else None,
        "strategy_signals": strat_scores,
        "horizon": horizon,
        "regime": regime,
    }
