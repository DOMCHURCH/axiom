"""Macro / economic backdrop — deterministic, zero-AI.

Pulls a handful of market-moving indicators from FRED (GDP, jobs, CPI, rates,
yield curve, VIX) and the upcoming high-impact release calendar from FMP, then
attaches a plain-English reading and a trading takeaway to each — plus an overall
risk-on / risk-off regime read. Everything degrades gracefully if a key is unset.
"""

from __future__ import annotations

from datetime import date, timedelta

from app.core.cache import _key, cache_get, cache_set
from app.core.logging import get_logger
from app.data import fred

log = get_logger("economic")

# series, label, unit, how we read it, and which direction is good for equities
SPECS = [
    {"key": "gdp", "series": "A191RL1Q225SBEA", "label": "Real GDP growth",
     "unit": "% ann.", "kind": "rate", "good": "up"},
    {"key": "unemployment", "series": "UNRATE", "label": "Unemployment rate",
     "unit": "%", "kind": "rate", "good": "down"},
    {"key": "claims", "series": "ICSA", "label": "Initial jobless claims",
     "unit": "", "kind": "level", "good": "down"},
    {"key": "inflation", "series": "CPIAUCSL", "label": "CPI inflation (YoY)",
     "unit": "%", "kind": "yoy", "good": "down"},
    {"key": "fed_funds", "series": "FEDFUNDS", "label": "Fed funds rate",
     "unit": "%", "kind": "rate", "good": "down"},
    {"key": "yield_curve", "series": "T10Y2Y", "label": "Yield curve (10Y–2Y)",
     "unit": "%", "kind": "rate", "good": "up"},
    {"key": "ten_year", "series": "DGS10", "label": "10-year Treasury",
     "unit": "%", "kind": "rate", "good": "neutral"},
    {"key": "vix", "series": "VIXCLS", "label": "Volatility (VIX)",
     "unit": "", "kind": "level", "good": "down"},
]


def _fmt(v, unit: str) -> str:
    if v is None:
        return "—"
    if unit == "":  # raw level (claims, VIX)
        return f"{v:,.0f}" if abs(v) >= 1000 else f"{v:,.1f}"
    if unit.startswith("%"):
        return f"{v:,.2f}%"
    return f"{v:,.1f} {unit}".strip()


def _read(spec: dict) -> dict | None:
    """Compute latest value, prior, change, market signal + copy for one indicator."""
    if spec["kind"] == "yoy":
        obs = fred.observations(spec["series"], limit=14)
        if len(obs) < 13:
            return None
        value = round((obs[0]["value"] / obs[12]["value"] - 1) * 100, 2)
        prior = (round((obs[1]["value"] / obs[13]["value"] - 1) * 100, 2)
                 if len(obs) >= 14 else None)
        updated = obs[0]["date"]
    else:
        obs = fred.observations(spec["series"], limit=2)
        if not obs:
            return None
        value = round(obs[0]["value"], 2)
        prior = round(obs[1]["value"], 2) if len(obs) > 1 else None
        updated = obs[0]["date"]

    change = round(value - prior, 2) if prior is not None else None

    # base market signal from the direction of change
    signal = "neutral"
    if change is not None and spec["good"] != "neutral":
        rising = change > 0
        good_up = spec["good"] == "up"
        improving = (rising and good_up) or (not rising and not good_up)
        if abs(change) > 1e-9:
            signal = "positive" if improving else "negative"

    impact, explanation, how = _copy(spec, value, prior, change, signal)
    return {
        "key": spec["key"], "label": spec["label"], "unit": spec["unit"],
        "value": value, "value_fmt": _fmt(value, spec["unit"]),
        "prior": prior, "change": change, "updated": updated,
        "signal": signal, "impact": impact,
        "explanation": explanation, "how_to_use": how,
    }


def _dir_word(change, up="rose", down="fell", flat="held steady"):
    if change is None or abs(change) < 1e-9:
        return flat
    return up if change > 0 else down


def _copy(spec, value, prior, change, signal) -> tuple[str, str, str]:
    """Deterministic reading + trading takeaway per indicator."""
    k = spec["key"]
    d = _dir_word(change)

    if k == "gdp":
        impact = "Expansion" if value >= 2 else "Slowing" if value >= 0 else "Contraction"
        return (impact,
                f"The economy grew at {value:.1f}% annualized last quarter and {d} vs the prior reading.",
                "Solid growth supports cyclicals and small caps; a sharp slowdown favors defensives and quality.")
    if k == "unemployment":
        impact = "Tight" if value < 4.5 else "Loosening" if value < 5.5 else "Weak"
        return (impact,
                f"Unemployment is {value:.1f}% and {d}. A rising jobless rate is an early recession tell.",
                "Rising unemployment is risk-off — tighten stops and lean defensive; a low, stable rate favors risk.")
    if k == "claims":
        impact = "Firming" if (change or 0) < 0 else "Softening"
        return (impact,
                f"Weekly jobless claims came in near {value:,.0f} and {d}. It's the fastest read on layoffs.",
                "A sustained climb in claims often precedes market pullbacks — a reason to size trades smaller.")
    if k == "inflation":
        impact = "Hot" if value > 3.5 else "Cooling" if value <= 2.6 else "Sticky"
        return (impact,
                f"Consumer prices are up {value:.1f}% year-over-year and the trend {d}.",
                "Hot inflation keeps the Fed hawkish (pressure on stocks); cooling inflation is a tailwind for risk.")
    if k == "fed_funds":
        impact = "Restrictive" if value >= 4 else "Neutral" if value >= 2.5 else "Easy"
        return (impact,
                f"The policy rate sits at {value:.2f}% and {d}. It sets the cost of money for everything.",
                "Cuts are fuel for equities (especially growth); hikes are a headwind — trade with the rate trend.")
    if k == "yield_curve":
        inverted = value < 0
        impact = "Inverted" if inverted else "Normal"
        expl = (f"The 10Y–2Y spread is {value:.2f}%, which is inverted — historically a recession warning."
                if inverted else
                f"The 10Y–2Y spread is {value:.2f}% (normal) and {d}.")
        return (impact, expl,
                "An inverted curve says stay selective and defensive; a steepening curve is an early risk-on signal.")
    if k == "ten_year":
        return ("Context",
                f"The 10-year Treasury yields {value:.2f}% and {d}. It's the discount rate for stocks.",
                "Fast-rising yields pressure high-multiple growth names; falling yields help them.")
    if k == "vix":
        impact = "Calm" if value < 16 else "Elevated" if value < 26 else "Fear"
        return (impact,
                f"The VIX is {value:.1f} ({impact.lower()}) and {d}. It measures expected market volatility.",
                "High VIX means wider swings — smaller size, wider stops; low VIX favors trend-following.")
    return ("", "", "")


def _regime(indicators: list[dict]) -> dict:
    """Aggregate the signals into a single risk-on / risk-off stance."""
    score = 0
    drivers = []
    for ind in indicators:
        if ind["key"] == "ten_year":
            continue
        if ind["key"] == "yield_curve" and ind["value"] is not None and ind["value"] < 0:
            score -= 1
            drivers.append("an inverted yield curve")
            continue
        if ind["key"] == "vix" and ind["value"] is not None and ind["value"] >= 26:
            score -= 1
            drivers.append("elevated volatility")
            continue
        if ind["signal"] == "positive":
            score += 1
        elif ind["signal"] == "negative":
            score -= 1
            drivers.append(ind["label"].lower())

    if score >= 2:
        stance = "Risk-on"
    elif score == 1:
        stance = "Mildly risk-on"
    elif score == 0:
        stance = "Neutral / mixed"
    elif score == -1:
        stance = "Mildly risk-off"
    else:
        stance = "Risk-off / defensive"

    if stance.startswith("Risk-on") or stance.startswith("Mildly risk-on"):
        summary = "The macro backdrop is supportive — favor with-trend longs and cyclicals."
    elif stance.startswith("Neutral"):
        summary = "Signals are mixed — trade selectively and respect stops; no strong macro edge either way."
    else:
        drv = ", ".join(list(dict.fromkeys(drivers))[:3]) if drivers else "weakening data"
        summary = f"Caution is warranted ({drv}) — trim size, favor quality and defensives, keep stops tight."
    return {"stance": stance, "score": score, "summary": summary}


def _calendar(days: int = 10) -> list[dict]:
    """Upcoming high/medium-impact US macro releases from FMP (best-effort)."""
    from app.data import fmp
    today = date.today()
    try:
        raw = fmp.economic_calendar(today.isoformat(), (today + timedelta(days=days)).isoformat())
    except Exception:  # noqa: BLE001 — budget exhausted / network
        return []
    if not isinstance(raw, list):
        return []
    out = []
    for e in raw:
        if (e.get("country") or "").upper() not in ("US", "USA", "UNITED STATES"):
            continue
        if (e.get("impact") or "").lower() not in ("high", "medium"):
            continue
        out.append({
            "date": e.get("date"), "event": e.get("event"), "impact": e.get("impact"),
            "previous": e.get("previous"), "estimate": e.get("estimate"), "actual": e.get("actual"),
        })
    out.sort(key=lambda x: x["date"] or "")
    return out[:14]


def economic_snapshot() -> dict:
    """Full macro backdrop — cached 1h. Safe to call from a request thread."""
    key = _key("econ_snapshot_v1")
    hit = cache_get(key)
    if hit is not None:
        return hit

    indicators = [r for r in (_read(s) for s in SPECS) if r]
    result = {
        "as_of": date.today().isoformat(),
        "available": bool(indicators),
        "indicators": indicators,
        "regime": _regime(indicators) if indicators else
                  {"stance": "Unavailable", "score": 0,
                   "summary": "Add a free FRED_API_KEY to the backend to enable the macro read."},
        "calendar": _calendar(),
        "sources": ["FRED (Federal Reserve)", "FMP economic calendar"],
    }
    cache_set(key, result, 3600)
    return result
