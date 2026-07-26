"""Trading workstation endpoints: Find Best Trades, recommendations, active trades."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_auth
from app.data.liquid_universe import TICKER_SECTOR
from app.db.models import ActiveTrade, Company, StockPrice, TradeRecommendation, TradeRun
from app.db.session import get_db

router = APIRouter(prefix="/trades", tags=["trades"], dependencies=[Depends(require_auth)])
active_router = APIRouter(prefix="/active-trades", tags=["active-trades"],
                         dependencies=[Depends(require_auth)])


def _n(v):
    return float(v) if v is not None else None


# ------------------------------------------------------------------ find trades
class FindBody(BaseModel):
    capital: float = 10_000
    horizon: str = "1w"
    num_positions: int | None = None
    keep: int | None = None
    enrich: bool | None = None
    universe_limit: int | None = None


@router.post("/find")
async def find_trades(body: FindBody) -> dict:
    from app.worker.runner import submit_trade_scan
    params = {k: v for k, v in body.model_dump().items() if v is not None}
    job_id, trade_run_id = submit_trade_scan(params)
    return {"job_id": job_id, "trade_run_id": trade_run_id, "params": params}


def _run(r: TradeRun) -> dict:
    return {"id": r.id, "status": r.status, "stage": r.stage, "progress": r.progress,
            "capital": _n(r.capital), "horizon": r.horizon, "counts": r.counts,
            "allocation": r.allocation, "error": r.error,
            "started_at": r.started_at, "finished_at": r.finished_at}


def _rec(r: TradeRecommendation) -> dict:
    from app.quant.data_sources import build_data_sources
    from app.quant.rationale import build_rationale
    from app.quant.timing import build_timing
    d = {
        "id": r.id, "rank": r.rank, "ticker": r.ticker, "horizon": r.horizon,
        "strategy": r.strategy, "strategy_label": r.strategy_label,
        "overall_score": _n(r.overall_score), "confidence": r.confidence,
        "current_price": _n(r.current_price), "risk_level": r.risk_level,
        "expected_rr": _n(r.expected_rr), "sub_scores": r.sub_scores,
        "strategy_signals": r.strategy_signals, "setup": r.setup,
        "allocation": r.allocation,
    }
    d["rationale"] = build_rationale(d)
    d["timing"] = build_timing(d.get("setup"), d.get("horizon"))
    d["data_sources"] = build_data_sources(d)
    return d


@router.get("/runs")
async def list_runs(limit: int = 20, db: AsyncSession = Depends(get_db)) -> dict:
    rows = (await db.execute(select(TradeRun).order_by(desc(TradeRun.id)).limit(limit))).scalars().all()
    return {"runs": [_run(r) for r in rows]}


@router.get("/runs/{run_id}")
async def get_run(run_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    r = await db.get(TradeRun, run_id)
    return _run(r) if r else {"error": "not found"}


async def _run_recs(db: AsyncSession, run_id: int) -> list[dict]:
    rows = (await db.execute(
        select(TradeRecommendation, Company)
        .join(Company, Company.id == TradeRecommendation.company_id)
        .where(TradeRecommendation.trade_run_id == run_id)
        .order_by(TradeRecommendation.rank))).all()
    return [{**_rec(r), "name": c.name, "sector": TICKER_SECTOR.get(r.ticker) or c.sector}
            for r, c in rows]


@router.get("/runs/{run_id}/recommendations")
async def run_recs(run_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    return {"run_id": run_id, "recommendations": await _run_recs(db, run_id)}


@router.get("/latest")
async def latest(db: AsyncSession = Depends(get_db)) -> dict:
    run = (await db.execute(select(TradeRun).where(TradeRun.status == "succeeded")
           .order_by(desc(TradeRun.id)).limit(1))).scalar_one_or_none()
    if not run:
        return {"run": None, "recommendations": []}
    return {"run": _run(run), "recommendations": await _run_recs(db, run.id)}


@router.get("/detail/{ticker}")
async def detail(ticker: str, db: AsyncSession = Depends(get_db)) -> dict:
    r = (await db.execute(select(TradeRecommendation)
         .where(TradeRecommendation.ticker == ticker.upper())
         .order_by(desc(TradeRecommendation.id)).limit(1))).scalar_one_or_none()
    if not r:
        raise HTTPException(404, "no trade recommendation for this ticker")
    company = await db.get(Company, r.company_id)
    out = _rec(r)
    out["name"] = company.name if company else None
    out["sector"] = TICKER_SECTOR.get(r.ticker) or (company.sector if company else None)
    return out


# ---------------------------------------------------------------- active trades
class ActiveBody(BaseModel):
    ticker: str
    strategy: str | None = None
    horizon: str | None = None
    entry_price: float | None = None
    stop_loss: float | None = None
    target_1: float | None = None
    target_2: float | None = None
    shares: float | None = None
    opened_at: date | None = None
    original_confidence: int | None = None
    original_thesis: str | None = None
    status: str | None = None
    notes: str | None = None


async def _last_close(db: AsyncSession, company_id: int | None, ticker: str) -> float | None:
    if company_id is None:
        c = await db.scalar(select(Company).where(Company.ticker == ticker.upper()))
        company_id = c.id if c else None
    if company_id is None:
        return None
    price = await db.scalar(select(StockPrice.close).where(StockPrice.company_id == company_id)
                            .order_by(desc(StockPrice.ts)).limit(1))
    return float(price) if price is not None else None


async def _active(db: AsyncSession, t: ActiveTrade) -> dict:
    last = await _last_close(db, t.company_id, t.ticker)
    entry, shares = _n(t.entry_price), _n(t.shares)
    pl = pl_pct = value = None
    if last and entry and shares:
        value = last * shares
        pl = (last - entry) * shares
        pl_pct = last / entry - 1.0
    days_held = (date.today() - t.opened_at).days if t.opened_at else None
    return {
        "id": t.id, "ticker": t.ticker, "strategy": t.strategy, "horizon": t.horizon,
        "entry_price": entry, "stop_loss": _n(t.stop_loss), "target_1": _n(t.target_1),
        "target_2": _n(t.target_2), "shares": shares, "opened_at": t.opened_at, "status": t.status,
        "last_price": last, "market_value": value, "unrealized_pl": pl, "unrealized_pl_pct": pl_pct,
        "days_held": days_held, "original_confidence": t.original_confidence,
        "original_thesis": t.original_thesis, "last_review": t.last_review, "notes": t.notes,
    }


@active_router.get("")
async def list_active(db: AsyncSession = Depends(get_db)) -> dict:
    rows = (await db.execute(select(ActiveTrade).order_by(desc(ActiveTrade.id)))).scalars().all()
    return {"trades": [await _active(db, t) for t in rows]}


@active_router.post("")
async def add_active(body: ActiveBody, db: AsyncSession = Depends(get_db)) -> dict:
    c = await db.scalar(select(Company).where(Company.ticker == body.ticker.upper()))
    t = ActiveTrade(company_id=c.id if c else None, opened_at=body.opened_at or date.today(),
                    status=body.status or "open", **body.model_dump(exclude={"status", "opened_at"},
                                                                    exclude_none=True))
    t.ticker = body.ticker.upper()
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return await _active(db, t)


@active_router.post("/from-recommendation/{rec_id}")
async def from_recommendation(rec_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    r = await db.get(TradeRecommendation, rec_id)
    if not r:
        raise HTTPException(404, "recommendation not found")
    setup = r.setup or {}
    alloc = r.allocation or {}
    t = ActiveTrade(
        ticker=r.ticker, company_id=r.company_id, strategy=r.strategy_label, horizon=r.horizon,
        entry_price=setup.get("current_price"), stop_loss=setup.get("stop_loss"),
        target_1=setup.get("target_1"), target_2=setup.get("target_2"),
        shares=alloc.get("shares"), opened_at=date.today(), status="open",
        original_confidence=r.confidence,
        original_thesis=(r.ai_thesis or {}).get("trading_thesis") if r.ai_thesis else None,
    )
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return await _active(db, t)


@active_router.patch("/{trade_id}")
async def update_active(trade_id: int, body: ActiveBody, db: AsyncSession = Depends(get_db)) -> dict:
    t = await db.get(ActiveTrade, trade_id)
    if not t:
        raise HTTPException(404, "trade not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(t, k, v)
    await db.commit()
    await db.refresh(t)
    return await _active(db, t)


@active_router.delete("/{trade_id}")
async def delete_active(trade_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    t = await db.get(ActiveTrade, trade_id)
    if not t:
        raise HTTPException(404, "trade not found")
    await db.delete(t)
    await db.commit()
    return {"ok": True}


@active_router.post("/{trade_id}/review")
async def review_active(trade_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    if not await db.get(ActiveTrade, trade_id):
        raise HTTPException(404, "trade not found")
    from app.worker.runner import submit_trade_review
    return {"job_id": submit_trade_review(trade_id)}
