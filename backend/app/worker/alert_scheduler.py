"""In-process email-alert scheduler.

A single daemon thread (one uvicorn worker) that every INTERVAL seconds fires any
due trade alerts: time alerts whose fire_at has passed, and price alerts whose
ticker's last price has crossed the level. Sends via AgentMail, marks rows sent.
Best-effort — a failed send stays 'armed' and retries next tick; long-stale time
alerts are expired (so a multi-day outage doesn't spam entry emails on restart).
"""

from __future__ import annotations

import threading
import time as _time
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from app.core.logging import get_logger

log = get_logger("alert_scheduler")

INTERVAL = 60
_started = False
_last_aux = 0.0
_lock = threading.Lock()


def _tick() -> None:
    from sqlalchemy import select

    from app.data import agentmail, yahoo
    from app.db.models import TradeAlert
    from app.db.session import session_scope

    if not agentmail.configured():
        return

    now = datetime.now(timezone.utc)
    with session_scope() as s:
        armed = s.execute(select(TradeAlert).where(TradeAlert.status == "armed")).scalars().all()
        rows = [(a.id, a.ticker, a.email, a.subject or "", a.body or "", a.trigger_type,
                 a.fire_at, a.price_op, float(a.price_level) if a.price_level is not None else None)
                for a in armed]
    if not rows:
        return

    # current prices for any price-triggered tickers (Yahoo, unlimited)
    prices: dict[str, float | None] = {}
    for t in {r[1] for r in rows if r[5] == "price"}:
        try:
            prices[t] = (yahoo.get_quote(t) or {}).get("last_price")
        except Exception:  # noqa: BLE001
            prices[t] = None

    due: list[tuple] = []
    expired: list[int] = []
    for (aid, tk, email, subj, body, ttype, fire_at, pop, plevel) in rows:
        if ttype == "time":
            if fire_at is None:
                continue
            fa = fire_at if fire_at.tzinfo else fire_at.replace(tzinfo=timezone.utc)
            if fa <= now:
                if fa < now - timedelta(days=2):
                    expired.append(aid)
                else:
                    due.append((aid, email, subj, body))
        elif ttype == "price":
            px = prices.get(tk)
            if px is None or plevel is None:
                continue
            if (pop == "lte" and px <= plevel) or (pop == "gte" and px >= plevel):
                due.append((aid, email, subj, body))

    results = []
    for (aid, email, subj, body) in due:
        ok, mid = agentmail.send_email(email, subj, body)
        results.append((aid, ok, mid))
        if ok:
            log.info("alert sent", extra={"id": aid, "to": email})

    if results or expired:
        with session_scope() as s:
            for aid, ok, mid in results:
                a = s.get(TradeAlert, aid)
                if a and a.status == "armed" and ok:
                    a.status = "sent"
                    a.sent_at = now
                    a.message_id = mid
            for aid in expired:
                a = s.get(TradeAlert, aid)
                if a and a.status == "armed":
                    a.status = "expired"


def _maybe_send_brief() -> None:
    """Once each weekday morning (>=9:00 ET), email the daily AI market brief."""
    from app.config import settings
    from app.core.cache import _key, cache_get, cache_set
    from app.data import agentmail

    if not (settings.ai_brief_enabled and settings.openrouter_api_key and agentmail.configured()):
        return
    from app.services import app_settings
    email = app_settings.alert_recipient()
    if not email:
        return
    now_et = datetime.now(ZoneInfo("America/New_York"))
    if now_et.weekday() >= 5 or now_et.hour < 9:
        return
    flag = _key("brief_emailed", now_et.date().isoformat())
    if cache_get(flag) is not None:
        return

    from app.services.ai_brief import generate_brief
    brief = generate_brief()
    if brief.get("available") and brief.get("content"):
        agentmail.send_email(email, f"☀ Daily market brief — {now_et.strftime('%b %d')}", brief["content"])
        cache_set(flag, True, 20 * 3600)
        log.info("daily brief emailed", extra={"to": email})
    else:
        cache_set(flag, True, 3600)  # don't retry every minute on a hard failure


def _maybe_send_position_warnings() -> None:
    """Advance heads-ups for open positions: upcoming earnings + market-moving macro."""
    from datetime import date as _date

    from sqlalchemy import select

    from app.config import settings
    from app.core.cache import _key, cache_get, cache_set
    from app.data import agentmail, finnhub
    from app.db.models import Position
    from app.db.session import session_scope
    from app.services import app_settings

    if not agentmail.configured():
        return
    email = app_settings.alert_recipient()
    if not email:
        return
    now_et = datetime.now(ZoneInfo("America/New_York"))
    if now_et.weekday() >= 5 or now_et.hour < 9:
        return

    with session_scope() as s:
        tickers = list({p.ticker for p in
                        s.execute(select(Position).where(Position.status == "open")).scalars().all()})
    if not tickers:
        return

    today: _date = now_et.date()
    in2 = (today + timedelta(days=2)).isoformat()

    # 1) high-impact macro releases in the next 2 days (once/day)
    macro_flag = _key("warn_macro", today.isoformat())
    if cache_get(macro_flag) is None:
        try:
            from app.services.economic import economic_snapshot
            cal = economic_snapshot().get("calendar", []) or []
        except Exception:  # noqa: BLE001
            cal = []
        soon = [f"{e.get('event')} ({(e.get('date') or '')[:10]})" for e in cal
                if e.get("impact") == "High" and today.isoformat() <= (e.get("date") or "")[:10] <= in2]
        if soon:
            body = ("Heads up — high-impact economic events in the next couple of days:\n- "
                    + "\n- ".join(soon[:6])
                    + f"\n\nThese can move the whole market. Consider tightening stops on your open "
                    f"positions: {', '.join(tickers)}.")
            agentmail.send_email(email, "⚠ Market-moving events ahead", body)
        cache_set(macro_flag, True, 20 * 3600)

    # 2) earnings within 3 days per open position (dedupe per ticker+date)
    in3 = (today + timedelta(days=3)).isoformat()
    for t in tickers:
        try:
            cal = finnhub.earnings_calendar(t, days_ahead=5)
        except Exception:  # noqa: BLE001
            cal = []
        for e in cal:
            d = e.get("date")
            if d and today.isoformat() <= d <= in3:
                flag = _key("warn_earn", t, d)
                if cache_get(flag) is not None:
                    break
                agentmail.send_email(
                    email, f"⚠ {t} earnings {d} — protect your position",
                    f"{t} reports earnings on {d}. Earnings can gap a stock hard in either direction.\n\n"
                    "If you're holding through it, that's a bet on the print — consider trimming or a "
                    "tighter stop beforehand to protect the position.")
                cache_set(flag, True, 4 * 24 * 3600)
                break


def _loop() -> None:
    global _last_aux
    _time.sleep(10)  # let the app finish booting / migrations settle
    while True:
        try:
            _tick()
        except Exception as exc:  # noqa: BLE001 — never let the loop die
            log.warning("alert tick failed", extra={"err": str(exc)})
        # aux tasks (daily brief + advance warnings) are cheap but don't need to run
        # every minute — throttle to ~5 min so we don't spin the data providers.
        if _time.time() - _last_aux >= 300:
            _last_aux = _time.time()
            for fn, name in ((_maybe_send_brief, "daily brief"),
                             (_maybe_send_position_warnings, "position warnings")):
                try:
                    fn()
                except Exception as exc:  # noqa: BLE001
                    log.warning(f"{name} failed", extra={"err": str(exc)})
        _time.sleep(INTERVAL)


def start_scheduler() -> None:
    """Idempotently start the background alert loop (only if AgentMail is set)."""
    global _started
    from app.data import agentmail
    if not agentmail.configured():
        log.info("alert scheduler idle (AGENTMAIL_API_KEY not set)")
        return
    with _lock:
        if _started:
            return
        t = threading.Thread(target=_loop, name="alert-scheduler", daemon=True)
        t.start()
        _started = True
        log.info("alert scheduler started")
