"""Email trade-alert endpoints — arm/list/cancel timed & price alerts (AgentMail)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import desc, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_auth
from app.config import settings
from app.db.models import TradeAlert, TradeRecommendation
from app.db.session import get_db

router = APIRouter(prefix="/alerts", tags=["alerts"], dependencies=[Depends(require_auth)])


class ArmBody(BaseModel):
    email: str | None = None


def _serialize(a: TradeAlert) -> dict:
    return {
        "id": a.id, "ticker": a.ticker, "kind": a.kind, "label": a.label,
        "subject": a.subject, "trigger_type": a.trigger_type,
        "fire_at": a.fire_at, "price_op": a.price_op,
        "price_level": float(a.price_level) if a.price_level is not None else None,
        "status": a.status, "sent_at": a.sent_at,
    }


def _resolve_email(body: ArmBody) -> str:
    from app.data import agentmail
    recips = agentmail.parse_recipients(body.email or settings.alert_email or "")
    if not recips:
        raise HTTPException(400, "No recipient email. Set one in Settings (or ALERT_EMAIL).")
    return ", ".join(recips)


@router.get("/status")
async def status() -> dict:
    from app.data import agentmail
    configured = agentmail.configured()
    watch_email = settings.watch_email or settings.alert_email or None
    return {
        "configured": configured,
        "default_email": settings.alert_email or None,
        "watch": {
            "enabled": settings.watch_enabled,
            "running": bool(settings.watch_enabled and configured and watch_email),
            "interval_min": settings.watch_interval_min,
            "min_score": settings.watch_min_score,
            "min_confidence": settings.watch_min_confidence,
            "max_per_day": settings.watch_max_per_day,
            "capital": settings.watch_capital,
            "horizon": settings.watch_horizon,
            "extended_hours": settings.watch_extended_hours,
            "email": watch_email,
        },
    }


@router.post("/test")
async def test_email(body: ArmBody) -> dict:
    import asyncio

    from app.data import agentmail
    if not agentmail.configured():
        raise HTTPException(400, "Add AGENTMAIL_API_KEY to the backend first.")
    email = _resolve_email(body)
    ok, info = await asyncio.to_thread(
        agentmail.send_email, email, "✅ Daddiesmoney test email",
        "This is a test — your trade alerts are wired up correctly. You'll get emails like this "
        "when it's time to enter, take profit, or exit a trade.")
    if not ok:
        raise HTTPException(502, f"AgentMail didn't accept it: {info or 'check the API key / inbox / recipient.'}")
    return {"ok": True, "email": email, "message_id": info}


@router.get("")
async def list_alerts(db: AsyncSession = Depends(get_db)) -> dict:
    rows = (await db.execute(select(TradeAlert).order_by(desc(TradeAlert.id)).limit(200))).scalars().all()
    return {"alerts": [_serialize(a) for a in rows]}


async def _arm_for_rec(db: AsyncSession, rec: TradeRecommendation, email: str) -> list[dict]:
    from app.api.routes.trades import _rec
    from app.services.alerts import build_alert_specs
    # re-arm: cancel any still-armed alerts for this recommendation
    await db.execute(update(TradeAlert)
                     .where(TradeAlert.rec_id == rec.id, TradeAlert.status == "armed")
                     .values(status="cancelled"))
    specs = build_alert_specs(_rec(rec), email)
    created = []
    for spec in specs:
        a = TradeAlert(**spec)
        db.add(a)
        created.append(a)
    await db.flush()
    return [_serialize(a) for a in created]


@router.post("/from-recommendation/{rec_id}")
async def arm_rec(rec_id: int, body: ArmBody, db: AsyncSession = Depends(get_db)) -> dict:
    from app.data import agentmail
    if not agentmail.configured():
        raise HTTPException(400, "Email alerts aren't set up — add AGENTMAIL_API_KEY to the backend.")
    rec = await db.get(TradeRecommendation, rec_id)
    if not rec:
        raise HTTPException(404, "recommendation not found")
    email = _resolve_email(body)
    alerts = await _arm_for_rec(db, rec, email)
    await db.commit()
    return {"ticker": rec.ticker, "email": email, "alerts": alerts}


@router.post("/from-run/{run_id}")
async def arm_run(run_id: int, body: ArmBody, db: AsyncSession = Depends(get_db)) -> dict:
    from app.data import agentmail
    if not agentmail.configured():
        raise HTTPException(400, "Email alerts aren't set up — add AGENTMAIL_API_KEY to the backend.")
    email = _resolve_email(body)
    recs = (await db.execute(select(TradeRecommendation)
            .where(TradeRecommendation.trade_run_id == run_id)
            .order_by(TradeRecommendation.rank))).scalars().all()
    recs = [r for r in recs if r.allocation]  # only the sized trades
    if not recs:
        raise HTTPException(404, "no allocated trades in this run")
    out = []
    for r in recs:
        out.extend(await _arm_for_rec(db, r, email))
    await db.commit()
    return {"email": email, "count": len(recs), "alerts": out}


@router.delete("/{alert_id}")
async def cancel(alert_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    a = await db.get(TradeAlert, alert_id)
    if not a:
        raise HTTPException(404, "alert not found")
    a.status = "cancelled"
    await db.commit()
    return {"ok": True}


@router.delete("")
async def cancel_all(db: AsyncSession = Depends(get_db)) -> dict:
    await db.execute(update(TradeAlert).where(TradeAlert.status == "armed").values(status="cancelled"))
    await db.commit()
    return {"ok": True}
