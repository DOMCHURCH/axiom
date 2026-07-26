"""Generate + store AI trade theses, and re-evaluate open trades."""

from __future__ import annotations

from datetime import date

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.ai.trade_report import generate_review, generate_trade_thesis
from app.core.logging import get_logger
from app.data import gdelt, yahoo
from app.db.models import ActiveTrade, Company, FinancialData, StockPrice, TradeRecommendation
from app.db.session import session_scope
from app.quant.strategies import compute_strategy_signals
from app.quant.technical import compute_technicals
from app.quant.trade_scoring import HORIZON_DAYS, HORIZON_LABEL, compute_trade_scores

log = get_logger("trade_thesis")


def _fund_row(s: Session, company_id: int) -> dict:
    f = s.scalar(select(FinancialData).where(FinancialData.company_id == company_id)
                 .order_by(desc(FinancialData.fiscal_date)))
    if not f:
        return {}
    return {"revenue_growth": _n(f.revenue_growth), "net_margin": _n(f.net_margin),
            "roe": _n(f.roe), "roic": _n(f.roic)}


def _n(v):
    return float(v) if v is not None else None


def generate_and_store_thesis(recommendation_id: int) -> dict:
    with session_scope() as s:
        rec = s.get(TradeRecommendation, recommendation_id)
        if not rec:
            raise ValueError("recommendation not found")
        company = s.get(Company, rec.company_id)
        name = company.name if company else rec.ticker
        headlines = []
        sentiment = None
        try:
            headlines = [a["title"] for a in gdelt.articles(name or rec.ticker, maxrecords=6) if a.get("title")]
            sentiment = gdelt.tone(name or rec.ticker).get("sentiment_score")
        except Exception:
            pass
        ctx = {
            "ticker": rec.ticker, "name": name, "sector": company.sector if company else None,
            "horizon_label": HORIZON_LABEL.get(rec.horizon, rec.horizon),
            "strategy_label": rec.strategy_label, "setup": rec.setup,
            "sub_scores": rec.sub_scores, "strategy_signals": rec.strategy_signals,
            "overall_score": float(rec.overall_score) if rec.overall_score is not None else None,
            "confidence": rec.confidence, "risk_level": rec.risk_level,
            "fundamentals": _fund_row(s, rec.company_id), "headlines": headlines, "sentiment": sentiment,
        }

    thesis = generate_trade_thesis(ctx)

    with session_scope() as s:
        rec = s.get(TradeRecommendation, recommendation_id)
        rec.ai_thesis = thesis
    return thesis


def review_active_trade(active_trade_id: int) -> dict:
    with session_scope() as s:
        at = s.get(ActiveTrade, active_trade_id)
        if not at:
            raise ValueError("active trade not found")
        ticker, horizon = at.ticker, at.horizon or "1w"
        entry = _n(at.entry_price)
        stop, t1, t2 = _n(at.stop_loss), _n(at.target_1), _n(at.target_2)
        opened = at.opened_at
        orig_conf, orig_thesis = at.original_confidence, at.original_thesis
        strat_label = at.strategy

    df = yahoo.fetch_ohlcv(ticker, period="6mo")
    tech = compute_technicals(df) or {}
    res = compute_strategy_signals(df, tech)
    sc = compute_trade_scores(res["signals"], res["features"], tech, None, None, horizon)
    price = tech.get("last_price")
    pl_pct = (price / entry - 1.0) if (price and entry) else None
    days_held = (date.today() - opened).days if opened else None

    ctx = {
        "ticker": ticker, "strategy_label": strat_label,
        "horizon_label": HORIZON_LABEL.get(horizon, horizon),
        "entry_price": entry, "stop_loss": stop, "target_1": t1, "target_2": t2,
        "original_confidence": orig_conf, "original_thesis": orig_thesis,
        "current_price": round(price, 2) if price else None,
        "pl_pct": f"{pl_pct*100:.1f}%" if pl_pct is not None else "n/a",
        "days_held": days_held, "holding_days": HORIZON_DAYS.get(horizon),
        "current_overall": sc["overall_score"], "current_confidence": sc["confidence"],
        "trend_score": sc["sub_scores"].get("trend_score"),
        "momentum_score": sc["sub_scores"].get("momentum_score"),
        "dist_to_stop_pct": f"{(price/stop-1)*100:.1f}%" if (price and stop) else "n/a",
        "dist_to_t1_pct": f"{(t1/price-1)*100:.1f}%" if (price and t1) else "n/a",
    }
    review = generate_review(ctx)
    review["current_price"] = ctx["current_price"]
    review["pl_pct"] = ctx["pl_pct"]
    review["days_held"] = days_held

    with session_scope() as s:
        at = s.get(ActiveTrade, active_trade_id)
        at.last_review = review
    return review
