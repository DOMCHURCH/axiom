"""Assemble numeric + textual context from the DB and generate an AI report."""

from __future__ import annotations

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.ai import rag, research
from app.core.logging import get_logger
from app.data import gdelt
from app.db.models import AiReport, Company, FinancialData, NewsArticle, StockScore, TechnicalMetric
from app.db.session import session_scope
from app.services import filings

log = get_logger("report_service")

RAG_QUERIES = [
    "business overview products segments and revenue drivers",
    "risk factors and material uncertainties",
    "competition margins and outlook guidance",
]


def _fundamentals_from_row(fin: FinancialData | None) -> dict:
    if fin is None:
        return {}
    return {
        "fiscal_date": str(fin.fiscal_date) if fin.fiscal_date else None,
        "revenue": _num(fin.revenue), "revenue_growth": _num(fin.revenue_growth),
        "earnings": _num(fin.earnings), "eps": _num(fin.eps),
        "gross_margin": _num(fin.gross_margin), "operating_margin": _num(fin.operating_margin),
        "net_margin": _num(fin.net_margin), "free_cash_flow": _num(fin.free_cash_flow),
        "fcf_growth": _num(fin.fcf_growth), "total_debt": _num(fin.total_debt),
        "cash": _num(fin.cash), "roic": _num(fin.roic), "roe": _num(fin.roe),
        "valuation_metrics": fin.valuation_metrics or {},
    }


def _num(v):
    return float(v) if v is not None else None


def _technicals_from_row(t: TechnicalMetric | None) -> dict:
    if t is None:
        return {}
    extra = t.extra or {}
    return {
        "last_price": extra.get("last_price"),
        "rsi": _num(t.rsi), "macd_hist": _num(t.macd_hist), "sma_50": _num(t.sma_50),
        "sma_200": _num(t.sma_200), "momentum": _num(t.momentum), "volatility": _num(t.volatility),
        "drawdown": _num(t.drawdown), "trend_score": _num(t.trend_score), "extra": extra,
    }


def _scores_from_row(sc: StockScore | None) -> dict:
    if sc is None:
        return {}
    return {
        "technical_score": _num(sc.technical_score), "fundamental_score": _num(sc.fundamental_score),
        "growth_score": _num(sc.growth_score), "value_score": _num(sc.value_score),
        "quality_score": _num(sc.quality_score), "risk_score": _num(sc.risk_score),
        "total_score": _num(sc.total_score), "recommendation": sc.recommendation,
    }


def assemble_context(session: Session, company: Company) -> dict:
    sc = session.scalar(select(StockScore).where(StockScore.company_id == company.id)
                        .order_by(desc(StockScore.as_of)))
    tech = session.scalar(select(TechnicalMetric).where(TechnicalMetric.company_id == company.id)
                          .order_by(desc(TechnicalMetric.as_of)))
    fin = session.scalar(select(FinancialData).where(FinancialData.company_id == company.id)
                         .order_by(desc(FinancialData.fiscal_date)))
    news_rows = session.execute(
        select(NewsArticle).where(NewsArticle.company_id == company.id)
        .order_by(desc(NewsArticle.published_at)).limit(8)).scalars().all()

    tdict = _technicals_from_row(tech)

    # news: DB first, else a live GDELT tone lookup
    if news_rows:
        headlines = [n.headline for n in news_rows if n.headline]
        scores = [float(n.sentiment_score) for n in news_rows if n.sentiment_score is not None]
        news = {"sentiment_score": round(sum(scores) / len(scores), 3) if scores else None,
                "volume": len(news_rows), "headlines": headlines}
    else:
        tone = gdelt.tone(company.name or company.ticker)
        arts = gdelt.articles(company.name or company.ticker, maxrecords=6)
        news = {"sentiment_score": tone.get("sentiment_score"), "volume": tone.get("volume"),
                "headlines": [a["title"] for a in arts if a.get("title")]}

    # filing excerpts via RAG (best-effort)
    excerpts: list[dict] = []
    try:
        for q in RAG_QUERIES:
            excerpts.extend(rag.search_filings(session, company.id, q, k=2))
    except Exception as exc:
        log.warning("rag search skipped", extra={"err": str(exc)})

    return {
        "ticker": company.ticker, "name": company.name, "sector": company.sector,
        "industry": company.industry, "market_cap": _num(company.market_cap),
        "scores": _scores_from_row(sc), "technicals": tdict,
        "fundamentals": _fundamentals_from_row(fin), "news": news,
        "filings": excerpts, "market": {},
    }


def generate_and_store(company_id: int, *, ensure_filings: bool = True,
                       reasoning_effort: str = "medium") -> int:
    with session_scope() as s:
        company = s.get(Company, company_id)
        if company is None:
            raise ValueError(f"company {company_id} not found")
        if ensure_filings:
            try:
                filings.ensure_indexed(s, company)
            except Exception as exc:
                log.warning("filing ingest skipped", extra={"err": str(exc)})
        ctx = assemble_context(s, company)

    rep = research.generate_report(ctx, reasoning_effort=reasoning_effort)

    with session_scope() as s:
        obj = AiReport(
            company_id=company_id, model=rep["model"],
            company_overview=rep["company_overview"], thesis=rep["thesis"],
            bull_case=rep["bull_case"], bear_case=rep["bear_case"],
            catalysts=rep["catalysts"], risks=rep["risks"],
            technical_analysis=rep["technical_analysis"],
            fundamental_analysis=rep["fundamental_analysis"],
            recommendation=rep["recommendation"], confidence=rep["confidence"],
            scores_snapshot=rep["scores_snapshot"], tokens_used=rep["tokens_used"],
        )
        s.add(obj)
        s.flush()
        return obj.id
