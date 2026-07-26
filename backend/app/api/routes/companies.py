"""Company / research endpoints for the Stock Research page."""

from __future__ import annotations

import asyncio
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_auth
from app.data import polygon
from app.db.models import (
    AiReport, Company, FinancialData, NewsArticle, SecFiling, StockPrice, StockScore, TechnicalMetric,
)
from app.db.session import get_db

router = APIRouter(prefix="/companies", tags=["companies"], dependencies=[Depends(require_auth)])

_RANGE_DAYS = {"1M": 31, "3M": 93, "6M": 186, "1Y": 372, "5Y": 1830}


async def _company(db: AsyncSession, ticker: str) -> Company:
    c = await db.scalar(select(Company).where(Company.ticker == ticker.upper()))
    if c is None:
        raise HTTPException(404, f"unknown ticker {ticker}")
    return c


@router.get("")
async def search(q: str | None = None, sector: str | None = None, limit: int = 25,
                 db: AsyncSession = Depends(get_db)) -> dict:
    stmt = select(Company).where(Company.is_active.is_(True))
    if q:
        like = f"%{q.upper()}%"
        stmt = stmt.where(or_(Company.ticker.like(like), func.upper(Company.name).like(like)))
    if sector:
        stmt = stmt.where(Company.sector == sector)
    rows = (await db.execute(stmt.order_by(Company.ticker).limit(limit))).scalars().all()
    return {"companies": [{"ticker": c.ticker, "name": c.name, "sector": c.sector,
                           "market_cap": float(c.market_cap) if c.market_cap else None} for c in rows]}


@router.get("/{ticker}")
async def profile(ticker: str, db: AsyncSession = Depends(get_db)) -> dict:
    c = await _company(db, ticker)
    score = await db.scalar(select(StockScore).where(StockScore.company_id == c.id)
                            .order_by(desc(StockScore.as_of)))
    return {
        "ticker": c.ticker, "name": c.name, "cik": c.cik, "exchange": c.exchange,
        "sector": c.sector, "industry": c.industry,
        "market_cap": float(c.market_cap) if c.market_cap else None,
        "scores": None if not score else {
            "technical": _n(score.technical_score), "fundamental": _n(score.fundamental_score),
            "growth": _n(score.growth_score), "value": _n(score.value_score),
            "quality": _n(score.quality_score), "risk": _n(score.risk_score),
            "total": _n(score.total_score), "recommendation": score.recommendation,
            "as_of": score.as_of},
    }


@router.get("/{ticker}/prices")
async def prices(ticker: str, range: str = "1Y", db: AsyncSession = Depends(get_db)) -> dict:
    c = await _company(db, ticker)
    since = date.today() - timedelta(days=_RANGE_DAYS.get(range.upper(), 372))
    rows = (await db.execute(
        select(StockPrice).where(StockPrice.company_id == c.id, StockPrice.ts >= since)
        .order_by(StockPrice.ts))).scalars().all()
    return {"ticker": c.ticker, "candles": [{
        "time": str(p.ts), "open": _n(p.open), "high": _n(p.high),
        "low": _n(p.low), "close": _n(p.close), "volume": p.volume} for p in rows]}


@router.get("/{ticker}/technicals")
async def technicals(ticker: str, db: AsyncSession = Depends(get_db)) -> dict:
    c = await _company(db, ticker)
    t = await db.scalar(select(TechnicalMetric).where(TechnicalMetric.company_id == c.id)
                        .order_by(desc(TechnicalMetric.as_of)))
    if not t:
        return {"ticker": c.ticker, "technicals": None}
    return {"ticker": c.ticker, "as_of": t.as_of, "technicals": {
        k: _n(getattr(t, k)) for k in ("rsi", "macd", "macd_signal", "macd_hist", "sma_20",
        "sma_50", "sma_200", "ema_12", "ema_26", "bb_upper", "bb_mid", "bb_lower", "atr",
        "volatility", "momentum", "drawdown", "trend_score")} | {"extra": t.extra}}


@router.get("/{ticker}/fundamentals")
async def fundamentals(ticker: str, db: AsyncSession = Depends(get_db)) -> dict:
    c = await _company(db, ticker)
    rows = (await db.execute(select(FinancialData).where(FinancialData.company_id == c.id)
            .order_by(desc(FinancialData.fiscal_date)).limit(8))).scalars().all()
    return {"ticker": c.ticker, "periods": [{
        "period": f.period, "fiscal_date": str(f.fiscal_date) if f.fiscal_date else None,
        "revenue": _n(f.revenue), "revenue_growth": _n(f.revenue_growth),
        "earnings": _n(f.earnings), "eps": _n(f.eps), "gross_margin": _n(f.gross_margin),
        "operating_margin": _n(f.operating_margin), "net_margin": _n(f.net_margin),
        "free_cash_flow": _n(f.free_cash_flow), "roic": _n(f.roic), "roe": _n(f.roe),
        "total_debt": _n(f.total_debt), "cash": _n(f.cash),
        "valuation_metrics": f.valuation_metrics} for f in rows]}


@router.get("/{ticker}/valuation")
async def valuation(ticker: str, db: AsyncSession = Depends(get_db)) -> dict:
    """Intrinsic value: two-stage DCF + seeded Monte Carlo + football-field ranges.

    All math is Python (app.quant.valuation). Returns a payload with null fields
    rather than an error when there is no fundamental data for the ticker yet.
    """
    from app.quant.valuation import build_valuation
    from app.services.report import _fundamentals_from_row, _technicals_from_row

    c = await _company(db, ticker)
    fin = await db.scalar(select(FinancialData).where(FinancialData.company_id == c.id)
                          .order_by(desc(FinancialData.fiscal_date)))
    t = await db.scalar(select(TechnicalMetric).where(TechnicalMetric.company_id == c.id)
                        .order_by(desc(TechnicalMetric.as_of)))

    fund = dict(_fundamentals_from_row(fin))
    if fund.get("market_cap") is None and c.market_cap is not None:
        fund["market_cap"] = _n(c.market_cap)   # market cap lives on companies
    tech = _technicals_from_row(t)
    return {"ticker": c.ticker,
            "valuation": build_valuation(fund, tech, price=tech.get("last_price"))}


@router.get("/{ticker}/filings")
async def filings(ticker: str, db: AsyncSession = Depends(get_db)) -> dict:
    c = await _company(db, ticker)
    rows = (await db.execute(select(SecFiling).where(SecFiling.company_id == c.id)
            .order_by(desc(SecFiling.filing_date)).limit(20))).scalars().all()
    return {"ticker": c.ticker, "filings": [{
        "id": f.id, "type": f.filing_type, "date": str(f.filing_date) if f.filing_date else None,
        "url": f.url, "has_summary": bool(f.summary), "embedded": f.embedded} for f in rows]}


@router.get("/{ticker}/news")
async def news(ticker: str, limit: int = 18, db: AsyncSession = Depends(get_db)) -> dict:
    """Live, multi-source news (Finnhub + GDELT + Yahoo), deduped + newest-first."""
    c = await _company(db, ticker)
    from app.services.news_feed import fetch_news
    feed = await asyncio.to_thread(fetch_news, c.ticker, c.name, limit)
    return {"ticker": c.ticker, **feed}


@router.get("/{ticker}/sec")
async def sec_records(ticker: str, db: AsyncSession = Depends(get_db)) -> dict:
    """Recent SEC/EDGAR filings with a plain-English what/why/how for each."""
    c = await _company(db, ticker)
    if not c.cik:
        return {"ticker": c.ticker, "filings": [], "note": "No SEC CIK on file for this ticker."}
    from app.data import sec
    from app.quant.sec_explain import explain_filing
    forms = ("8-K", "10-Q", "10-K", "4", "SC 13D", "SC 13G", "DEF 14A")
    rows = await asyncio.to_thread(sec.recent_filings, c.cik, forms, 14)
    return {"ticker": c.ticker, "filings": [{
        "type": f.get("filing_type"), "date": f.get("filing_date"),
        "period": f.get("period_of_report"), "url": f.get("url"),
        **explain_filing(f.get("filing_type")),
    } for f in rows]}


@router.get("/{ticker}/scores")
async def scores(ticker: str, db: AsyncSession = Depends(get_db)) -> dict:
    c = await _company(db, ticker)
    rows = (await db.execute(select(StockScore).where(StockScore.company_id == c.id)
            .order_by(desc(StockScore.as_of)).limit(30))).scalars().all()
    return {"ticker": c.ticker, "history": [{
        "as_of": s.as_of, "total": _n(s.total_score), "technical": _n(s.technical_score),
        "fundamental": _n(s.fundamental_score), "growth": _n(s.growth_score),
        "value": _n(s.value_score), "quality": _n(s.quality_score), "risk": _n(s.risk_score),
        "recommendation": s.recommendation} for s in rows]}


@router.get("/{ticker}/report")
async def get_report(ticker: str, db: AsyncSession = Depends(get_db)) -> dict:
    c = await _company(db, ticker)
    r = await db.scalar(select(AiReport).where(AiReport.company_id == c.id)
                        .order_by(desc(AiReport.created_at)))
    if not r:
        return {"ticker": c.ticker, "report": None}
    return {"ticker": c.ticker, "report": _report(r)}


@router.post("/{ticker}/report")
async def make_report(ticker: str, db: AsyncSession = Depends(get_db)) -> dict:
    c = await _company(db, ticker)
    from app.worker.runner import submit_report
    job_id = submit_report(c.id)
    return {"job_id": job_id, "ticker": c.ticker}


@router.get("/{ticker}/quote")
async def quote(ticker: str, db: AsyncSession = Depends(get_db)) -> dict:
    c = await _company(db, ticker)
    snap = await asyncio.to_thread(polygon.snapshot, c.ticker)
    if snap is None:
        raise HTTPException(503, "quote temporarily rate-limited")
    return snap


def _n(v):
    return float(v) if v is not None else None


def _report(r: AiReport) -> dict:
    return {
        "id": r.id, "model": r.model, "company_overview": r.company_overview,
        "thesis": r.thesis, "bull_case": r.bull_case, "bear_case": r.bear_case,
        "catalysts": r.catalysts, "risks": r.risks,
        "technical_analysis": r.technical_analysis, "fundamental_analysis": r.fundamental_analysis,
        "valuation_analysis": r.valuation_analysis, "price_target": _n(r.price_target),
        "recommendation": r.recommendation, "confidence": r.confidence,
        "scores_snapshot": r.scores_snapshot, "created_at": r.created_at,
    }
