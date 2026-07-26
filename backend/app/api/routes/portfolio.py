"""Portfolio — manual holdings for research/decision support (no trading)."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_auth
from app.db.models import Company, Portfolio, StockPrice
from app.db.session import get_db

router = APIRouter(prefix="/portfolio", tags=["portfolio"], dependencies=[Depends(require_auth)])


class HoldingBody(BaseModel):
    ticker: str
    shares: float | None = None
    entry_price: float | None = None
    entry_date: date | None = None
    thesis: str | None = None
    current_status: str | None = None
    notes: str | None = None


async def _last_close(db: AsyncSession, ticker: str) -> float | None:
    c = await db.scalar(select(Company).where(Company.ticker == ticker.upper()))
    if not c:
        return None
    price = await db.scalar(select(StockPrice.close).where(StockPrice.company_id == c.id)
                            .order_by(desc(StockPrice.ts)).limit(1))
    return float(price) if price is not None else None


def _holding(h: Portfolio, last: float | None) -> dict:
    entry = float(h.entry_price) if h.entry_price is not None else None
    shares = float(h.shares) if h.shares is not None else None
    pl = pl_pct = market_value = None
    if last is not None and entry is not None and shares is not None:
        market_value = last * shares
        pl = (last - entry) * shares
        pl_pct = (last / entry - 1.0) if entry else None
    return {"id": h.id, "ticker": h.ticker, "shares": shares, "entry_price": entry,
            "entry_date": h.entry_date, "thesis": h.thesis, "status": h.current_status,
            "notes": h.notes, "last_price": last, "market_value": market_value,
            "unrealized_pl": pl, "unrealized_pl_pct": pl_pct}


@router.get("")
async def list_holdings(db: AsyncSession = Depends(get_db)) -> dict:
    rows = (await db.execute(select(Portfolio).order_by(Portfolio.ticker))).scalars().all()
    out = []
    for h in rows:
        out.append(_holding(h, await _last_close(db, h.ticker)))
    return {"holdings": out}


@router.post("")
async def add_holding(body: HoldingBody, db: AsyncSession = Depends(get_db)) -> dict:
    c = await db.scalar(select(Company).where(Company.ticker == body.ticker.upper()))
    h = Portfolio(ticker=body.ticker.upper(), company_id=c.id if c else None,
                  shares=body.shares, entry_price=body.entry_price, entry_date=body.entry_date,
                  thesis=body.thesis, current_status=body.current_status or "open", notes=body.notes)
    db.add(h)
    await db.commit()
    await db.refresh(h)
    return _holding(h, await _last_close(db, h.ticker))


@router.patch("/{holding_id}")
async def update_holding(holding_id: int, body: HoldingBody, db: AsyncSession = Depends(get_db)) -> dict:
    h = await db.get(Portfolio, holding_id)
    if not h:
        raise HTTPException(404, "holding not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(h, "current_status" if k == "current_status" else k, v)
    await db.commit()
    await db.refresh(h)
    return _holding(h, await _last_close(db, h.ticker))


@router.delete("/{holding_id}")
async def delete_holding(holding_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    h = await db.get(Portfolio, holding_id)
    if not h:
        raise HTTPException(404, "holding not found")
    await db.delete(h)
    await db.commit()
    return {"ok": True}


@router.get("/analysis")
async def analysis(db: AsyncSession = Depends(get_db)) -> dict:
    rows = (await db.execute(select(Portfolio))).scalars().all()
    holdings = [_holding(h, await _last_close(db, h.ticker)) for h in rows]
    invested = sum((h["entry_price"] or 0) * (h["shares"] or 0) for h in holdings)
    value = sum(h["market_value"] or 0 for h in holdings)
    return {"count": len(holdings), "invested": invested, "market_value": value,
            "unrealized_pl": value - invested if holdings else 0,
            "holdings": holdings}
