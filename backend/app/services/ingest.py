"""Idempotent persistence of provider data into Postgres (sync session).

All writes use upserts keyed on the models' unique constraints, so re-running a
scan or refresh never duplicates rows and safely updates stale values.
"""

from __future__ import annotations

import math
from datetime import date, datetime

import pandas as pd
from dateutil import parser as dateparser
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.db.models import (
    Company, FinancialData, NewsArticle, StockPrice, StockScore, TechnicalMetric,
)

log = get_logger("ingest")


def _clean(x):
    """None for NaN/inf; native python otherwise."""
    if x is None:
        return None
    if isinstance(x, float) and not math.isfinite(x):
        return None
    if pd.isna(x) if not isinstance(x, (list, dict)) else False:
        return None
    return x


def _to_date(v) -> date | None:
    if v is None:
        return None
    if isinstance(v, date):
        return v
    if isinstance(v, datetime):
        return v.date()
    try:
        return dateparser.parse(str(v)).date()
    except (ValueError, TypeError):
        return None


def get_or_create_company(session: Session, ticker: str, **fields) -> Company:
    ticker = ticker.upper()
    company = session.scalar(select(Company).where(Company.ticker == ticker))
    if company is None:
        company = Company(ticker=ticker, **fields)
        session.add(company)
        session.flush()
    else:
        for k, v in fields.items():
            if v is not None:
                setattr(company, k, v)
    return company


def upsert_prices(session: Session, company_id: int, df: pd.DataFrame) -> int:
    if df is None or df.empty:
        return 0
    rows = []
    for ts, r in df.iterrows():
        d = _to_date(ts)
        if d is None:
            continue
        rows.append({
            "company_id": company_id, "ts": d,
            "open": _clean(r.get("open")), "high": _clean(r.get("high")),
            "low": _clean(r.get("low")), "close": _clean(r.get("close")),
            "adj_close": _clean(r.get("adj_close")), "volume": _clean(r.get("volume")),
        })
    if not rows:
        return 0
    stmt = pg_insert(StockPrice).values(rows)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_price_company_ts",
        set_={c: stmt.excluded[c] for c in ("open", "high", "low", "close", "adj_close", "volume")},
    )
    session.execute(stmt)
    company = session.get(Company, company_id)
    if company:
        company.last_priced_at = datetime.utcnow()
    return len(rows)


def save_technicals(session: Session, company_id: int, tech: dict, as_of: date | None = None) -> None:
    if not tech:
        return
    as_of = as_of or date.today()
    payload = {k: _clean(tech.get(k)) for k in (
        "rsi", "macd", "macd_signal", "macd_hist", "sma_20", "sma_50", "sma_200",
        "ema_12", "ema_26", "bb_upper", "bb_mid", "bb_lower", "atr", "volatility",
        "momentum", "drawdown", "trend_score",
    )}
    extra = {**(tech.get("extra") or {}), "last_price": _clean(tech.get("last_price"))}
    payload.update(company_id=company_id, as_of=as_of, extra=extra)
    stmt = pg_insert(TechnicalMetric).values(payload)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_tech_company_asof",
        set_={k: stmt.excluded[k] for k in payload if k not in ("company_id", "as_of")},
    )
    session.execute(stmt)


def save_fundamentals(session: Session, company_id: int, fund: dict,
                      period: str = "annual", source: str = "fmp") -> None:
    if not fund:
        return
    fiscal = _to_date(fund.get("fiscal_date")) or date.today()
    payload = {
        "company_id": company_id, "period": period, "fiscal_date": fiscal,
        "revenue": _clean(fund.get("revenue")), "revenue_growth": _clean(fund.get("revenue_growth")),
        "earnings": _clean(fund.get("earnings")), "eps": _clean(fund.get("eps")),
        "gross_margin": _clean(fund.get("gross_margin")),
        "operating_margin": _clean(fund.get("operating_margin")),
        "net_margin": _clean(fund.get("net_margin")),
        "free_cash_flow": _clean(fund.get("free_cash_flow")), "fcf_growth": _clean(fund.get("fcf_growth")),
        "total_debt": _clean(fund.get("total_debt")), "cash": _clean(fund.get("cash")),
        "roic": _clean(fund.get("roic")), "roe": _clean(fund.get("roe")),
        "valuation_metrics": fund.get("valuation_metrics"), "source": source,
    }
    stmt = pg_insert(FinancialData).values(payload)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_fin_company_period_date",
        set_={k: stmt.excluded[k] for k in payload if k not in ("company_id", "period", "fiscal_date")},
    )
    session.execute(stmt)
    # keep a denormalized market cap on the company for fast filtering
    if fund.get("market_cap"):
        c = session.get(Company, company_id)
        if c:
            c.market_cap = _clean(fund["market_cap"])


def save_scores(session: Session, company_id: int, scores: dict,
                scan_run_id: int | None = None, rank: int | None = None,
                as_of: date | None = None) -> None:
    if not scores:
        return
    as_of = as_of or date.today()
    payload = {
        "company_id": company_id, "as_of": as_of,
        "technical_score": _clean(scores.get("technical_score")),
        "fundamental_score": _clean(scores.get("fundamental_score")),
        "growth_score": _clean(scores.get("growth_score")),
        "value_score": _clean(scores.get("value_score")),
        "quality_score": _clean(scores.get("quality_score")),
        "risk_score": _clean(scores.get("risk_score")),
        "total_score": _clean(scores.get("total_score")),
        "rank": rank, "recommendation": scores.get("recommendation"),
        "breakdown": scores.get("breakdown"), "scan_run_id": scan_run_id,
    }
    stmt = pg_insert(StockScore).values(payload)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_score_company_asof",
        set_={k: stmt.excluded[k] for k in payload if k not in ("company_id", "as_of")},
    )
    session.execute(stmt)


def upsert_news(session: Session, company_id: int, articles: list[dict]) -> int:
    n = 0
    for a in articles or []:
        url = a.get("url")
        if not url:
            continue
        payload = {
            "company_id": company_id, "url": url, "headline": a.get("title") or a.get("headline"),
            "source": a.get("source"), "published_at": _to_date(a.get("published_at")),
            "sentiment_score": _clean(a.get("sentiment_score")),
            "sentiment_label": a.get("sentiment_label"),
        }
        stmt = pg_insert(NewsArticle).values(payload)
        stmt = stmt.on_conflict_do_nothing(constraint="uq_news_company_url")
        session.execute(stmt)
        n += 1
    return n
