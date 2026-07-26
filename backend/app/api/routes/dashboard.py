"""Dashboard / market overview, recent reports, provider budgets."""

from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_auth
from app.data import fmp
from app.data.limits import polygon_throttle
from app.db.models import AiReport, Company, NewsArticle, ScanRun, StockScore
from app.db.session import get_db

router = APIRouter(tags=["dashboard"], dependencies=[Depends(require_auth)])


@router.get("/market/overview")
async def overview(db: AsyncSession = Depends(get_db)) -> dict:
    companies = await db.scalar(select(func.count()).select_from(Company))
    active = await db.scalar(select(func.count()).select_from(Company).where(Company.is_active.is_(True)))
    last_run = (await db.execute(select(ScanRun).order_by(desc(ScanRun.id)).limit(1))).scalar_one_or_none()
    reports = await db.scalar(select(func.count()).select_from(AiReport))
    since = date.today() - timedelta(days=7)
    avg_sent = await db.scalar(
        select(func.avg(NewsArticle.sentiment_score)).where(NewsArticle.published_at >= since))
    return {
        "companies": companies, "active": active, "reports": reports,
        "avg_sentiment": float(avg_sent) if avg_sent is not None else None,
        "last_scan": None if not last_run else {
            "id": last_run.id, "status": last_run.status, "counts": last_run.counts,
            "finished_at": last_run.finished_at},
    }


@router.get("/market/top")
async def top(limit: int = 15, db: AsyncSession = Depends(get_db)) -> dict:
    latest_as_of = await db.scalar(select(func.max(StockScore.as_of)))
    if not latest_as_of:
        return {"as_of": None, "top": []}
    rows = (await db.execute(
        select(StockScore, Company).join(Company, Company.id == StockScore.company_id)
        .where(StockScore.as_of == latest_as_of)
        .order_by(desc(StockScore.total_score)).limit(limit))).all()
    return {"as_of": latest_as_of, "top": [{
        "ticker": c.ticker, "name": c.name, "sector": c.sector,
        "total_score": float(s.total_score) if s.total_score is not None else None,
        "recommendation": s.recommendation, "rank": s.rank,
    } for s, c in rows]}


@router.get("/market/sentiment")
async def sentiment(days: int = 14, db: AsyncSession = Depends(get_db)) -> dict:
    since = date.today() - timedelta(days=days)
    rows = (await db.execute(
        select(func.date(NewsArticle.published_at).label("d"),
               func.avg(NewsArticle.sentiment_score).label("s"),
               func.count().label("n"))
        .where(NewsArticle.published_at >= since)
        .group_by(func.date(NewsArticle.published_at)).order_by("d"))).all()
    return {"series": [{"date": str(r.d), "sentiment": float(r.s) if r.s is not None else None,
                        "volume": r.n} for r in rows]}


@router.get("/reports/recent")
async def recent_reports(limit: int = 10, db: AsyncSession = Depends(get_db)) -> dict:
    rows = (await db.execute(
        select(AiReport, Company).join(Company, Company.id == AiReport.company_id)
        .order_by(desc(AiReport.created_at)).limit(limit))).all()
    return {"reports": [{
        "id": r.id, "ticker": c.ticker, "name": c.name,
        "recommendation": r.recommendation, "confidence": r.confidence,
        "created_at": r.created_at,
    } for r, c in rows]}


@router.get("/meta/providers")
async def providers() -> dict:
    import asyncio

    from app.ai.budget import tokens_remaining, tokens_used
    from app.config import settings

    fmp_rem = await asyncio.to_thread(fmp.budget_remaining)
    poly_rem = await asyncio.to_thread(polygon_throttle.remaining_day)
    ai_used = await asyncio.to_thread(tokens_used)
    ai_rem = await asyncio.to_thread(tokens_remaining)

    fmp_limit = settings.fmp_daily_limit
    poly_limit = settings.polygon_per_day
    ai_budget = settings.ai_token_budget

    daily = [
        {"key": "fmp", "label": "Financial Modeling Prep", "role": "Fundamentals",
         "used": fmp_limit - fmp_rem, "limit": fmp_limit, "remaining": fmp_rem,
         "unit": "calls", "configured": bool(settings.fmp_api_key)},
        {"key": "polygon", "label": "Polygon", "role": "Real-time quotes",
         "used": poly_limit - poly_rem, "limit": poly_limit, "remaining": poly_rem,
         "unit": "calls", "configured": bool(settings.polygon_api_key)},
        {"key": "ai_tokens", "label": "AI tokens (GLM-5.2)", "role": "Research reports",
         "used": ai_used, "limit": ai_budget, "remaining": ai_rem,
         "unit": "tokens", "configured": bool(settings.openrouter_api_key)},
    ]
    rate = [
        {"key": "finnhub", "label": "Finnhub", "role": "Company news",
         "per_min": settings.finnhub_per_min, "configured": bool(settings.finnhub_api_key),
         "note": "60/min — no daily cap"},
        {"key": "gdelt", "label": "GDELT", "role": "News & sentiment",
         "per_min": 120, "configured": True, "note": "free · unlimited volume"},
        {"key": "sec", "label": "SEC EDGAR", "role": "Filings",
         "per_min": 300, "configured": True, "note": "free · fair-use"},
        {"key": "fred", "label": "FRED (Federal Reserve)", "role": "Economic data",
         "per_min": 120, "configured": bool(settings.fred_api_key),
         "note": "free" if settings.fred_api_key else "add FRED_API_KEY to enable"},
        {"key": "yahoo", "label": "Yahoo Finance", "role": "Prices & news",
         "per_min": None, "configured": True, "note": "free · unlimited"},
    ]
    return {
        # richer view for the Settings page
        "daily": daily, "rate": rate,
        # backward-compatible keys used by the dashboard pills
        "fmp": {"daily_remaining": fmp_rem},
        "polygon": {"day_remaining": poly_rem},
        "ai_tokens": {"used": ai_used, "remaining": ai_rem, "budget": ai_budget},
    }
