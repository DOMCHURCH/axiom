"""Plain-English 'why this trade' rationale, built deterministically from the
quant signals/setup (no AI tokens). Explains the reasoning, not just the numbers.
"""

from __future__ import annotations

STRATEGY_WHY = {
    "momentum": "strong, sustained upside momentum",
    "trend_following": "a clean, established uptrend",
    "breakout": "a breakout through its recent trading range",
    "pullback": "a pullback to support inside an uptrend — a lower-risk entry",
    "mean_reversion": "an oversold setup primed for a bounce",
    "gap": "a gap-up that is holding its gains",
    "volume_breakout": "a breakout on heavy, above-average volume",
    "ma_crossover": "a fresh bullish moving-average crossover",
    "volatility_expansion": "volatility expanding out of a quiet squeeze",
    "support_resistance_break": "a decisive break above prior resistance",
    "relative_strength": "clear relative strength versus the broad market",
}

SIGNAL_LABEL = {
    "trend_following": "Trend", "momentum": "Momentum", "breakout": "Breakout",
    "pullback": "Pullback", "relative_strength": "Rel. strength", "volume_breakout": "Volume",
    "gap": "Gap", "volatility_expansion": "Vol. expansion", "support_resistance_break": "S/R break",
    "ma_crossover": "MA cross", "mean_reversion": "Mean reversion",
}


def _px(v) -> str:
    return "—" if v is None else f"${float(v):,.2f}"


def _usd(v) -> str:
    if v is None:
        return "—"
    v = float(v)
    return f"${v:,.0f}" if abs(v) >= 1000 else f"${v:,.2f}"


def _pct(v, d=1) -> str:
    return "—" if v is None else f"{float(v) * 100:.{d}f}%"


def build_rationale(rec: dict) -> dict:
    ticker = rec.get("ticker")
    strat = rec.get("strategy")
    strat_label = (rec.get("strategy_label") or "this setup")
    conf = rec.get("confidence")
    score = rec.get("overall_score")
    risk = rec.get("risk_level") or "medium"
    setup = rec.get("setup") or {}
    signals = rec.get("strategy_signals") or {}
    alloc = rec.get("allocation") or {}
    regime = setup.get("regime")
    rr = setup.get("risk_reward_1")
    days = setup.get("holding_days")
    price = setup.get("current_price")

    # supporting signals (the confirmation beyond the primary strategy)
    strong = sorted(((k, v) for k, v in signals.items() if v is not None and v >= 55), key=lambda x: -x[1])
    factors = [f"{SIGNAL_LABEL.get(k, k.replace('_', ' ').title())} {v:.0f}/100" for k, v in strong[:4]]

    regime_line = ""
    if regime == "up":
        regime_line = " The broader trend is up — price is above its 50- and 200-day averages — so this is a with-trend long, the higher-probability direction."
    elif regime == "down":
        regime_line = " Note: the higher-timeframe trend is down, so this is a counter-trend bounce — keep the position small and respect the stop."

    conf_word = ("high" if (conf or 0) >= 72 else "solid" if (conf or 0) >= 60 else "moderate")
    summary = (
        f"{ticker} ranks here because it's showing {STRATEGY_WHY.get(strat, 'a favorable technical setup')}. "
        f"It scores {score}/100 overall with {conf_word} {conf}/100 confidence, and the supporting indicators agree "
        f"({', '.join(factors[:3]) if factors else 'several confirm'})." + regime_line
    )

    setup_note = (
        f"Buy in the {_px(setup.get('entry_low'))}–{_px(setup.get('entry_high'))} zone. "
        f"Sell targets are {_px(setup.get('target_1'))} then {_px(setup.get('target_2'))} (near resistance) — "
        f"a move to capture over about {days} trading day{'s' if (days or 0) != 1 else ''}. "
        "If it stalls, sell at the time exit rather than holding on."
    )

    shares = alloc.get("shares")
    whole = alloc.get("whole_shares")
    weight = alloc.get("weight_pct")
    dollars = alloc.get("target_dollars") or alloc.get("invested_dollars")
    if not alloc:
        alloc_note = "Shown as an opportunity — it didn't make the sized allocation this run."
    else:
        whole_txt = ""
        if whole is not None:
            whole_txt = (f" — as whole shares that's {whole} share{'s' if whole != 1 else ''} at {_px(price)}"
                         if whole else f", or a fractional share since one share is {_px(price)}")
        alloc_note = (
            f"Put {_usd(dollars)} into it — {weight}% of your capital ({shares} shares{whole_txt}). "
            f"It's weighted this size for {conf}/100 confidence and {risk} risk, then trimmed by "
            "correlation and the per-sector cap so no single theme dominates."
        )

    return {"summary": summary, "factors": factors, "setup_note": setup_note, "allocation_note": alloc_note}
