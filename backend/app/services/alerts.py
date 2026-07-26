"""Build the set of email alerts for a trade — the specific timed actions.

Pure/deterministic: given a recommendation + the recipient, produce alert specs
(entry now, stop hit, target hits, and a time-stop) that the scheduler later
fires via AgentMail. Market-hours aware (US/Eastern) for exit timing.
"""

from __future__ import annotations

from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")


def _px(v) -> str:
    return "—" if v is None else f"${float(v):,.2f}"


def _usd(v) -> str:
    if v is None:
        return "—"
    v = float(v)
    return f"${v:,.0f}" if abs(v) >= 1000 else f"${v:,.2f}"


def _et_at(h: int, m: int, on_date=None) -> datetime:
    """A US/Eastern wall-clock time on a date, returned as tz-aware UTC."""
    now_et = datetime.now(ET)
    d = on_date or now_et.date()
    return datetime.combine(d, time(h, m), tzinfo=ET).astimezone(timezone.utc)


def _next_weekday(d):
    while d.weekday() >= 5:  # Sat/Sun -> Mon
        d += timedelta(days=1)
    return d


def build_alert_specs(rec: dict, email: str) -> list[dict]:
    setup = rec.get("setup") or {}
    timing = rec.get("timing") or {}
    alloc = rec.get("allocation") or {}
    t = rec.get("ticker")
    now = datetime.now(timezone.utc)

    entry_low, entry_high = setup.get("entry_low"), setup.get("entry_high")
    t1, t2 = setup.get("target_1"), setup.get("target_2")
    put_in = alloc.get("target_dollars") or alloc.get("invested_dollars")
    shares = alloc.get("shares")
    is_intraday = bool(timing.get("is_intraday"))

    size_line = ""
    if put_in:
        size_line = f" Put in {_usd(put_in)}" + (f" (~{shares} shares)." if shares else ".")

    specs: list[dict] = []

    # 1) BUY — fires immediately (you're acting now)
    why = (rec.get("rationale") or {}).get("summary")
    specs.append({
        "kind": "entry", "trigger_type": "time", "fire_at": now,
        "label": "Buy",
        "subject": f"🟢 BUY {t}: {_px(entry_low)}–{_px(entry_high)}",
        "body": (f"{t} — BUY\n\n"
                 f"Buy in the {_px(entry_low)}–{_px(entry_high)} zone.{size_line}\n"
                 f"Sell targets: {_px(t1)} then {_px(t2)}.\n\n"
                 + (f"Why: {why}\n\n" if why else "")
                 + (timing.get("plan") or "")),
    })

    # 2) SELL — first target hit
    if t1:
        specs.append({
            "kind": "target1", "trigger_type": "price", "price_op": "gte", "price_level": t1,
            "label": "Sell — target 1",
            "subject": f"💰 SELL {t}: hit {_px(t1)} — take profit",
            "body": (f"{t} reached your first sell target at {_px(t1)}.\n\n"
                     "Sell here to lock in the gain — you can sell it all, or sell part and let the "
                     f"rest run toward {_px(t2)}. Booking profit is the whole point."),
        })
    # 3) SELL — second target hit
    if t2:
        specs.append({
            "kind": "target2", "trigger_type": "price", "price_op": "gte", "price_level": t2,
            "label": "Sell — target 2",
            "subject": f"💰 SELL {t}: hit {_px(t2)} — close it out",
            "body": (f"{t} reached your final sell target at {_px(t2)}.\n\n"
                     "Sell and book the full profit — this is exactly where the plan said to get out."),
        })

    # 4) SELL — time to exit (the downside/stall exit, no hard stop)
    if is_intraday:
        fire = _et_at(15, 50)
        if fire < now:
            fire = now
        specs.append({
            "kind": "exit", "trigger_type": "time", "fire_at": fire,
            "label": "Sell — before the close",
            "subject": f"🔴 SELL {t}: before today's close",
            "body": (f"{t} — SELL (intraday exit)\n\n"
                     "It's near the close (15:50 ET). Sell now — this is an intraday trade, so be "
                     "flat by the bell regardless of profit or loss."),
        })
    else:
        exit_by = timing.get("exit_by")
        fire = None
        if exit_by:
            try:
                d = _next_weekday(datetime.fromisoformat(exit_by).date())
                fire = _et_at(15, 45, on_date=d)
            except Exception:  # noqa: BLE001
                fire = None
        if fire:
            days = timing.get("holding_days")
            specs.append({
                "kind": "exit", "trigger_type": "time", "fire_at": fire,
                "label": "Sell — time to exit",
                "subject": f"🔴 SELL {t}: time to move on",
                "body": (f"{t} — SELL (time exit)\n\n"
                         f"Your ~{days}-trading-day window is up. If it hasn't hit a sell target, it's "
                         "stalled — sell and free the capital for a better setup. If it's close to a "
                         "target, you can give it a little room, but don't let a trade become a bag."),
            })

    for s in specs:
        s.update({"ticker": t, "rec_id": rec.get("id"), "email": email, "status": "armed"})
    return specs
