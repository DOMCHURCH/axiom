"""24/7 Market Watch — the autonomous dip/setup emailer.

A background daemon thread (single uvicorn worker) that, during US market hours,
periodically finds A+ setups on FREE data (Yahoo/quant, no FMP, no GLM) and — when
a strong stock is currently in its buy zone (a dip/pullback entry) — arms the full
alert lifecycle for it. The existing alert scheduler then emails the entry now and
the exit/stop/target actions as they trigger. Deduped per ticker with a daily cap,
so cost stays ~$0 and volume stays sane. Disabled unless WATCH_ENABLED + AgentMail.
"""

from __future__ import annotations

import threading
import time as _time
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from app.config import settings
from app.core.logging import get_logger

log = get_logger("market_watch")

ET = ZoneInfo("America/New_York")
_started = False
_last_scan = 0.0
_lock = threading.Lock()


def _market_open(now_et: datetime) -> bool:
    if now_et.weekday() >= 5:
        return False
    t = now_et.time()
    if settings.watch_extended_hours:
        return time(4, 0) <= t <= time(20, 0)
    return time(9, 30) <= t <= time(16, 0)


def _email() -> str:
    from app.services import app_settings
    return app_settings.alert_recipient()


def _build_rec(c: dict, price: float, size_factor: float = 1.0) -> dict:
    from app.quant.rationale import build_rationale
    from app.quant.timing import build_timing

    setup = dict(c["setup"] or {})
    setup["current_price"] = price
    sc = c["scores"] or {}
    cap = round(settings.watch_capital * size_factor, 2)
    shares = round(cap / price, 4) if price else 0.0
    rec = {
        "id": None, "ticker": c["ticker"], "current_price": price,
        "setup": setup, "strategy": sc.get("best_strategy"),
        "strategy_label": sc.get("best_strategy_label"),
        "confidence": sc.get("confidence"), "overall_score": sc.get("overall_score"),
        "risk_level": setup.get("risk_level"), "strategy_signals": c.get("signals"),
        "sub_scores": sc.get("sub_scores"),
        "allocation": {"target_dollars": round(cap, 2), "shares": shares,
                       "whole_shares": int(cap / price) if price else 0, "weight_pct": None},
    }
    rec["timing"] = build_timing(setup, settings.watch_horizon)
    rec["rationale"] = build_rationale(rec)
    return rec


def _tick() -> None:
    from sqlalchemy import func, select

    from app.data import agentmail, yahoo
    from app.db.models import TradeAlert
    from app.db.session import session_scope
    from app.services import app_settings
    from app.services.alerts import build_alert_specs
    from app.services.trade_scanner import scan_top

    if not (app_settings.automation_enabled() and agentmail.configured()):
        return
    email = _email()
    if not email:
        return
    if not _market_open(datetime.now(ET)):
        return

    # regime auto-throttle: trade full size in supportive markets, smaller when
    # mildly risk-off, and pause new buys when the macro backdrop is clearly risk-off.
    regime_score = 0
    try:
        from app.services.economic import economic_snapshot
        regime_score = (economic_snapshot().get("regime") or {}).get("score", 0) or 0
    except Exception:  # noqa: BLE001
        regime_score = 0
    if regime_score <= -2:
        log.info("market watch paused — risk-off regime", extra={"score": regime_score})
        return
    size_factor = 1.0 if regime_score >= 0 else 0.6
    min_score = settings.watch_min_score + (0 if regime_score >= 0 else 3)

    cands = scan_top(settings.watch_horizon, min_score,
                     settings.watch_min_confidence, limit=25)
    if not cands:
        return

    now = datetime.now(timezone.utc)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    with session_scope() as s:
        day_count = s.execute(
            select(func.count()).select_from(TradeAlert)
            .where(TradeAlert.kind == "entry", TradeAlert.rec_id.is_(None),
                   TradeAlert.created_at >= day_start)).scalar() or 0

    armed = 0
    for c in cands:
        if day_count + armed >= settings.watch_max_per_day:
            break
        setup = c.get("setup") or {}
        lo, hi = setup.get("entry_low"), setup.get("entry_high")
        if not (lo and hi):
            continue
        try:
            price = (yahoo.get_quote(c["ticker"]) or {}).get("last_price") or c.get("current_price")
        except Exception:  # noqa: BLE001
            price = c.get("current_price")
        if not price:
            continue
        # only alert when it's actually in the buy zone now (a dip / fresh entry) —
        # skip names that have already run well above the entry.
        if not (lo * 0.985 <= price <= hi * 1.005):
            continue

        # dedupe: not already signalled in the last day
        since = now - timedelta(hours=24)
        with session_scope() as s:
            recent = s.execute(
                select(func.count()).select_from(TradeAlert)
                .where(TradeAlert.ticker == c["ticker"], TradeAlert.kind == "entry",
                       TradeAlert.rec_id.is_(None), TradeAlert.created_at >= since)).scalar() or 0
        if recent:
            continue

        specs = build_alert_specs(_build_rec(c, price, size_factor), email)
        with session_scope() as s:
            for spec in specs:
                s.add(TradeAlert(**spec))
        armed += 1
        log.info("market watch signal armed", extra={"ticker": c["ticker"], "price": price})

    if armed:
        log.info("market watch tick complete", extra={"signals": armed})


def _loop() -> None:
    global _last_scan
    _time.sleep(15)
    while True:
        try:
            now = _time.time()
            if now - _last_scan >= settings.watch_interval_min * 60:
                _tick()
                _last_scan = now
        except Exception as exc:  # noqa: BLE001 — never let the loop die
            log.warning("market watch tick failed", extra={"err": str(exc)})
        _time.sleep(60)


def start_market_watch() -> None:
    """Start the watcher thread whenever AgentMail is configured. The thread idles
    cheaply until the in-app automation switch is flipped ON (checked each tick), so
    the toggle takes effect live without a redeploy."""
    global _started
    from app.data import agentmail
    if not agentmail.configured():
        log.info("market watch not started (needs AGENTMAIL_API_KEY)")
        return
    with _lock:
        if _started:
            return
        threading.Thread(target=_loop, name="market-watch", daemon=True).start()
        _started = True
        log.info("market watch thread live (waits for the in-app automation switch)")
