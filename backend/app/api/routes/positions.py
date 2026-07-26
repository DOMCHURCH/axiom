"""Positions ledger — log real buys/sells, track P&L, arm position-aware sell alerts."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import desc, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_auth
from app.config import settings
from app.db.models import Company, Position, TradeAlert, TradeRecommendation
from app.db.session import get_db

router = APIRouter(prefix="/positions", tags=["positions"], dependencies=[Depends(require_auth)])


class LogBuy(BaseModel):
    ticker: str
    buy_price: float
    shares: float | None = None
    amount: float | None = None
    stop_loss: float | None = None
    target_1: float | None = None
    target_2: float | None = None
    horizon: str | None = None
    strategy: str | None = None
    rec_id: int | None = None
    bought_at: datetime | None = None
    arm_alerts: bool = True
    email: str | None = None
    notes: str | None = None


class LogSell(BaseModel):
    sell_price: float
    sold_at: datetime | None = None


def _n(v):
    return float(v) if v is not None else None


def _serialize(p: Position, live: float | None) -> dict:
    buy = float(p.buy_price)
    shares = float(p.shares)
    invested = float(p.invested) if p.invested is not None else round(buy * shares, 2)
    d = {
        "id": p.id, "ticker": p.ticker, "buy_price": buy, "shares": shares,
        "invested": invested, "bought_at": p.bought_at, "horizon": p.horizon,
        "strategy": p.strategy, "stop_loss": _n(p.stop_loss), "target_1": _n(p.target_1),
        "target_2": _n(p.target_2), "status": p.status, "notes": p.notes,
        "source_rec_id": p.source_rec_id,
    }
    if p.status == "open":
        d["last_price"] = live
        if live:
            d["market_value"] = round(live * shares, 2)
            d["unrealized_pl"] = round((live - buy) * shares, 2)
            d["unrealized_pct"] = round(live / buy - 1, 4) if buy else None
    else:
        d["exit_price"] = _n(p.exit_price)
        d["exit_at"] = p.exit_at
        d["proceeds"] = _n(p.proceeds)
        d["realized_pl"] = _n(p.realized_pl)
        d["realized_pct"] = round(float(p.exit_price) / buy - 1, 4) if p.exit_price and buy else None
    return d


async def _live_prices(tickers: set[str]) -> dict[str, float | None]:
    import asyncio

    from app.data import yahoo

    def _fetch(t):
        try:
            return (yahoo.get_quote(t) or {}).get("last_price")
        except Exception:  # noqa: BLE001
            return None

    out = {}
    for t in tickers:
        out[t] = await asyncio.to_thread(_fetch, t)
    return out


def _arm_sell_alerts(db: AsyncSession, pos: Position, email: str) -> None:
    from app.quant.timing import HORIZON_DAYS
    from app.quant.timing import build_timing
    from app.services.alerts import build_alert_specs

    buy = float(pos.buy_price)
    setup = {
        "entry_low": buy, "entry_high": buy, "current_price": buy,
        "stop_loss": _n(pos.stop_loss), "target_1": _n(pos.target_1), "target_2": _n(pos.target_2),
        "holding_days": HORIZON_DAYS.get(pos.horizon or "1w", 5),
    }
    start = pos.bought_at.date() if pos.bought_at else None
    rec = {
        "id": None, "ticker": pos.ticker, "current_price": buy, "setup": setup,
        "timing": build_timing(setup, pos.horizon or "1w", start=start),
        "allocation": {"target_dollars": float(pos.invested or buy * float(pos.shares)),
                       "shares": float(pos.shares)},
    }
    for spec in build_alert_specs(rec, email):
        if spec["kind"] == "entry":   # already bought — only arm the SELL triggers
            continue
        spec["position_id"] = pos.id
        db.add(TradeAlert(**spec))


@router.post("")
async def log_buy(body: LogBuy, db: AsyncSession = Depends(get_db)) -> dict:
    price = body.buy_price
    if not price or price <= 0:
        raise HTTPException(400, "buy_price must be positive")
    shares = body.shares
    if shares is None and body.amount:
        shares = body.amount / price
    if not shares or shares <= 0:
        raise HTTPException(400, "provide shares or amount")

    stop, t1, t2 = body.stop_loss, body.target_1, body.target_2
    horizon, strategy = body.horizon, body.strategy
    if body.rec_id:  # fill missing fields from the source recommendation
        rec = await db.get(TradeRecommendation, body.rec_id)
        if rec:
            s = rec.setup or {}
            stop = stop if stop is not None else s.get("stop_loss")
            t1 = t1 if t1 is not None else s.get("target_1")
            t2 = t2 if t2 is not None else s.get("target_2")
            horizon = horizon or rec.horizon
            strategy = strategy or rec.strategy_label

    company = await db.scalar(select(Company).where(Company.ticker == body.ticker.upper()))
    pos = Position(
        ticker=body.ticker.upper(), company_id=company.id if company else None,
        buy_price=price, shares=shares, invested=round(price * shares, 2),
        bought_at=body.bought_at or datetime.now(timezone.utc), horizon=horizon,
        strategy=strategy, stop_loss=stop, target_1=t1, target_2=t2,
        source_rec_id=body.rec_id, status="open", notes=body.notes,
    )
    db.add(pos)
    await db.flush()

    from app.data import agentmail
    email = (body.email or settings.alert_email or "").strip()
    armed = False
    if body.arm_alerts and agentmail.configured() and email:
        _arm_sell_alerts(db, pos, email)
        armed = True
    await db.commit()
    await db.refresh(pos)
    live = (await _live_prices({pos.ticker})).get(pos.ticker)
    return {"position": _serialize(pos, live), "alerts_armed": armed}


@router.post("/{pos_id}/sell")
async def log_sell(pos_id: int, body: LogSell, db: AsyncSession = Depends(get_db)) -> dict:
    pos = await db.get(Position, pos_id)
    if not pos:
        raise HTTPException(404, "position not found")
    if pos.status != "open":
        raise HTTPException(400, "position already closed")
    if not body.sell_price or body.sell_price <= 0:
        raise HTTPException(400, "sell_price must be positive")

    shares = float(pos.shares)
    pos.exit_price = body.sell_price
    pos.exit_at = body.sold_at or datetime.now(timezone.utc)
    pos.proceeds = round(body.sell_price * shares, 2)
    pos.realized_pl = round((body.sell_price - float(pos.buy_price)) * shares, 2)
    pos.status = "closed"
    # cancel any still-armed sell alerts for this position
    await db.execute(update(TradeAlert)
                     .where(TradeAlert.position_id == pos.id, TradeAlert.status == "armed")
                     .values(status="cancelled"))
    await db.commit()
    await db.refresh(pos)
    return {"position": _serialize(pos, None)}


@router.delete("/{pos_id}")
async def delete_position(pos_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    pos = await db.get(Position, pos_id)
    if not pos:
        raise HTTPException(404, "position not found")
    await db.execute(update(TradeAlert)
                     .where(TradeAlert.position_id == pos.id, TradeAlert.status == "armed")
                     .values(status="cancelled"))
    await db.delete(pos)
    await db.commit()
    return {"ok": True}


@router.get("/analytics")
async def analytics(db: AsyncSession = Depends(get_db)) -> dict:
    """Equity curve + per-strategy / per-horizon breakdown from closed trades."""
    closed = (await db.execute(
        select(Position).where(Position.status == "closed")
        .order_by(Position.exit_at, Position.id))).scalars().all()

    def _pct(p):
        try:
            return float(p.exit_price) / float(p.buy_price) - 1 if p.exit_price and p.buy_price else None
        except ZeroDivisionError:
            return None

    curve, cum = [], 0.0
    for p in closed:
        if p.realized_pl is None:
            continue
        cum += float(p.realized_pl)
        curve.append({"date": (p.exit_at.isoformat() if p.exit_at else None),
                      "pl": round(float(p.realized_pl), 2), "cumulative": round(cum, 2),
                      "ticker": p.ticker})

    def _group(key_fn):
        g: dict[str, dict] = {}
        for p in closed:
            if p.realized_pl is None:
                continue
            k = key_fn(p) or "—"
            b = g.setdefault(k, {"trades": 0, "wins": 0, "total_pl": 0.0, "pcts": []})
            b["trades"] += 1
            if float(p.realized_pl) > 0:
                b["wins"] += 1
            b["total_pl"] += float(p.realized_pl)
            rp = _pct(p)
            if rp is not None:
                b["pcts"].append(rp)
        out = []
        for k, b in g.items():
            out.append({
                "key": k, "trades": b["trades"],
                "win_rate": round(b["wins"] / b["trades"], 3) if b["trades"] else None,
                "avg_pct": round(sum(b["pcts"]) / len(b["pcts"]), 4) if b["pcts"] else None,
                "total_pl": round(b["total_pl"], 2),
            })
        return sorted(out, key=lambda x: x["total_pl"], reverse=True)

    return {
        "equity_curve": curve,
        "by_strategy": _group(lambda p: p.strategy),
        "by_horizon": _group(lambda p: p.horizon),
        "count": len(closed),
    }


@router.get("")
async def list_positions(db: AsyncSession = Depends(get_db)) -> dict:
    rows = (await db.execute(select(Position).order_by(desc(Position.id)))).scalars().all()
    open_rows = [p for p in rows if p.status == "open"]
    live = await _live_prices({p.ticker for p in open_rows})
    positions = [_serialize(p, live.get(p.ticker) if p.status == "open" else None) for p in rows]

    realized = sum(float(p.realized_pl) for p in rows if p.status == "closed" and p.realized_pl is not None)
    unrealized = sum(d["unrealized_pl"] for d in positions if d.get("unrealized_pl") is not None)
    invested_open = sum(d["invested"] for d in positions if d["status"] == "open")
    mkt_open = sum(d.get("market_value") or 0 for d in positions if d["status"] == "open")
    closed = [p for p in rows if p.status == "closed"]
    wins = sum(1 for p in closed if p.realized_pl is not None and float(p.realized_pl) > 0)

    def _rpct(p):
        try:
            return float(p.exit_price) / float(p.buy_price) - 1 if p.exit_price and p.buy_price else None
        except ZeroDivisionError:
            return None

    win_pcts = [r for r in (_rpct(p) for p in closed
                if p.realized_pl is not None and float(p.realized_pl) > 0) if r is not None]
    loss_pcts = [r for r in (_rpct(p) for p in closed
                 if p.realized_pl is not None and float(p.realized_pl) <= 0) if r is not None]
    win_rate = wins / len(closed) if closed else None
    avg_win = sum(win_pcts) / len(win_pcts) if win_pcts else None
    avg_loss = sum(loss_pcts) / len(loss_pcts) if loss_pcts else None
    expectancy = (win_rate * avg_win + (1 - win_rate) * avg_loss) \
        if (win_rate is not None and avg_win is not None and avg_loss is not None) else None

    # fractional-Kelly position size from the measured edge (quarter-Kelly, capped).
    # Quarter-Kelly, not half: the edge is estimated with error, and estimation error
    # compounds sizing error. Quarter-Kelly cuts the probability of a >=50% drawdown
    # from ~12.5% (half-Kelly) to <0.8% — the honest choice for a real, noisy edge.
    kelly = recommended = None
    if (win_rate is not None and avg_win is not None and avg_loss and avg_loss < 0
            and len(closed) >= 8):
        R = avg_win / abs(avg_loss)
        if R > 0:
            kelly = win_rate - (1 - win_rate) / R
            recommended = max(0.0, min(0.15, kelly * 0.25))
    if len(closed) < 8:
        sizing_note = "Log ~8+ closed trades and it'll size positions from your real edge."
    elif expectancy is not None and expectancy <= 0:
        sizing_note = "No positive edge yet — keep sizes small (≤5%) until expectancy turns positive."
    elif recommended is not None:
        sizing_note = (f"Your edge supports ~{recommended * 100:.0f}% of capital per trade "
                       "(quarter-Kelly — sized for survival). Don't exceed it; your edge is "
                       "estimated with error, so bigger bets risk ruin.")
    else:
        sizing_note = "Keep sizes modest until the edge is clearer."

    return {
        "positions": positions,
        "summary": {
            "open_count": len(open_rows), "closed_count": len(closed),
            "invested_open": round(invested_open, 2), "market_value_open": round(mkt_open, 2),
            "unrealized_pl": round(unrealized, 2), "realized_pl": round(realized, 2),
            "total_pl": round(realized + unrealized, 2),
            "win_rate": round(win_rate, 3) if win_rate is not None else None,
            "avg_win_pct": round(avg_win, 4) if avg_win is not None else None,
            "avg_loss_pct": round(avg_loss, 4) if avg_loss is not None else None,
            "expectancy_pct": round(expectancy, 4) if expectancy is not None else None,
            "kelly_fraction": round(kelly, 4) if kelly is not None else None,
            "recommended_size_pct": round(recommended, 4) if recommended is not None else None,
            "sizing_note": sizing_note,
        },
    }
