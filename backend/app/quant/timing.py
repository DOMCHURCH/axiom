"""Trade timing / holding-window guidance — deterministic, zero-AI.

Turns the chosen horizon + setup into concrete 'how long to hold, when to act'
guidance: trading-day window, a target exit date, and a per-horizon playbook.
The frontend overlays the user's local timezone for the intraday session clock.
"""

from __future__ import annotations

from datetime import date, timedelta

from app.quant.trade_scoring import HORIZON_DAYS, HORIZON_LABEL


def _add_business_days(start: date, n: int) -> date:
    d, added = start, 0
    while added < n:
        d += timedelta(days=1)
        if d.weekday() < 5:  # Mon–Fri
            added += 1
    return d


def _window_phrase(days: int) -> str:
    if days <= 1:
        return "a single session (no overnight hold)"
    if days <= 3:
        return f"about {days} trading days"
    if days <= 5:
        return "about a trading week (~5 sessions)"
    if days <= 10:
        return "about two trading weeks (~10 sessions)"
    return f"about {days} trading days (~1 month)"


def build_timing(setup: dict | None, horizon: str, start: date | None = None) -> dict:
    setup = setup or {}
    days = setup.get("holding_days") or HORIZON_DAYS.get(horizon, 5)
    is_intraday = horizon == "intraday" or days <= 1
    label = HORIZON_LABEL.get(horizon, horizon)
    start = start or date.today()

    if is_intraday:
        exit_by = None
        checkpoints = [
            "Buy only after the open once price is in the buy zone — skip the first 5 min of noise.",
            "Sell into strength as it reaches your targets; scale out to book the gain.",
            "Sell everything before the close (~15:55 ET). No overnight hold on an intraday trade.",
        ]
        plan = ("This is a one-day trade — in and out during today's session. Buy on a clean move "
                "into the zone, sell into your targets, and be flat by the close.")
        session = {
            "market_open_et": "09:30", "market_close_et": "16:00", "timezone": "America/New_York",
            "guidance": "US regular hours are 09:30–16:00 ET. Trade the open drive and the "
                        "afternoon trend; avoid the low-volume lunch lull (~12:00–13:30 ET).",
        }
    else:
        exit_by = _add_business_days(start, days).isoformat()
        checkpoints = [
            "Buy when price trades into the buy zone with the setup still intact.",
            "Sell (take profit) as it reaches Sell Target 1, then Sell Target 2.",
            f"Sell by ~{exit_by} if it hasn't reached a target in ~{days} trading days — it's stalled.",
        ]
        plan = (f"Plan to hold {_window_phrase(days)}. Buy in the zone, sell at your targets, and sell "
                f"by ~{exit_by} if it hasn't moved — don't let a swing trade quietly become a long-term bag.")
        session = None

    return {
        "horizon": horizon,
        "horizon_label": label,
        "holding_days": days,
        "is_intraday": is_intraday,
        "hold_window": _window_phrase(days),
        "exit_by": exit_by,
        "checkpoints": checkpoints,
        "plan": plan,
        "session": session,
    }
