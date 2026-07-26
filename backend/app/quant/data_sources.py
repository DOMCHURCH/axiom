"""Per-stock 'what each data source told us' breakdown — deterministic, zero-AI.

Explains, for one trade recommendation, exactly what each feed contributed to the
score and setup, so nothing in the analysis is a black box.
"""

from __future__ import annotations


def _score_word(v) -> str:
    if v is None:
        return "no read"
    if v >= 70:
        return "strong"
    if v >= 55:
        return "constructive"
    if v >= 45:
        return "neutral"
    return "weak"


def _px(v) -> str:
    return "—" if v is None else f"${float(v):,.2f}"


def build_data_sources(rec: dict) -> list[dict]:
    sub = rec.get("sub_scores") or {}
    sig = rec.get("strategy_signals") or {}
    setup = rec.get("setup") or {}
    alloc = rec.get("allocation") or {}
    price = rec.get("current_price") or setup.get("current_price")

    def g(k):
        return sub.get(f"{k}_score")

    fired = [k for k, v in sig.items() if v is not None and v >= 55]
    out: list[dict] = []

    out.append({
        "source": "Yahoo Finance", "role": "Price & volume history", "used": True,
        "detail": f"One year of daily candles and the live price ({_px(price)}). Everything on the "
                  "chart and every technical below is computed from this feed.",
        "metric": _px(price),
    })
    out.append({
        "source": "Technical engine", "role": "Trend · momentum · volatility", "used": True,
        "detail": f"Momentum reads {_score_word(g('momentum'))}, trend {_score_word(g('trend'))}, "
                  f"volatility {_score_word(g('volatility'))}, breakout {_score_word(g('breakout'))} — "
                  "derived from RSI, MACD, moving averages and ATR.",
        "metric": None,
    })
    out.append({
        "source": "Strategy models", "role": "14-strategy scoring", "used": True,
        "detail": (f"{len(fired)} of the strategies fired constructively; the strongest is "
                   f"“{rec.get('strategy_label') or '—'}”, which is why it's framed this way.")
                  if sig else "Strategy signals unavailable.",
        "metric": f"{len(fired)}/{len(sig)} agree" if sig else None,
    })
    sent = g("sentiment")
    out.append({
        "source": "News & sentiment (GDELT)", "role": "Live news tone", "used": sent is not None,
        "detail": (f"Recent news tone is {_score_word(sent)} and nudged the score accordingly."
                   if sent is not None else
                   "No measurable news tone in the window — sentiment didn't move the score."),
        "metric": None if sent is None else f"{sent:.0f}/100",
    })
    fund = g("fundamental")
    out.append({
        "source": "Fundamentals (FMP / SEC)", "role": "Quality & valuation", "used": fund is not None,
        "detail": (f"Fundamentals score {_score_word(fund)} — a minor factor for short-term trades."
                   if fund is not None else
                   "Not pulled this scan — fundamentals are low-weight intraday/short-term. Run a deep "
                   "scan (enrich) to fold them in."),
        "metric": None if fund is None else f"{fund:.0f}/100",
    })
    risk = g("risk")
    out.append({
        "source": "Risk model", "role": "Safety & liquidity", "used": risk is not None,
        "detail": f"Safety reads {_score_word(risk)} from ATR, drawdown and dollar-liquidity "
                  "(higher = safer). This also drives how much capital the trade earns.",
        "metric": None if risk is None else f"{risk:.0f}/100",
    })
    if alloc:
        out.append({
            "source": "Allocation engine", "role": "Position sizing", "used": True,
            "detail": f"Sized to {alloc.get('weight_pct')}% of capital "
                      f"({alloc.get('shares')} shares) after confidence, volatility, correlation "
                      "and sector caps.",
            "metric": f"{alloc.get('weight_pct')}%",
        })
    return out
