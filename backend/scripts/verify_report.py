"""End-to-end AI report test: real AAPL technicals -> scores -> GLM-5.2 research note.
    PYTHONPATH=. .venv/Scripts/python.exe scripts/verify_report.py
"""

from __future__ import annotations

import json

from app.ai.research import generate_report
from app.data import yahoo
from app.quant.scoring import compute_scores
from app.quant.technical import compute_technicals

FUND = {
    "revenue": 4.02e11, "revenue_growth": 0.052, "earnings": 1.01e11, "earnings_growth": 0.07,
    "eps": 6.55, "eps_growth": 0.08, "gross_margin": 0.46, "operating_margin": 0.31,
    "net_margin": 0.25, "free_cash_flow": 9.9e10, "fcf_growth": 0.06, "debt_to_equity": 1.4,
    "current_ratio": 0.95, "roic": 0.55, "roe": 1.5, "beta": 1.25, "market_cap": 3.3e12,
    "valuation_metrics": {"pe": 33, "ps": 8.2, "pb": 48, "ev_ebitda": 24, "peg": 3.1,
                          "fcf_yield": 0.03, "dividend_yield": 0.004},
}


def main() -> None:
    df = yahoo.fetch_ohlcv("AAPL", period="1y")
    tech = compute_technicals(df)
    scores = compute_scores(tech, FUND)
    ctx = {
        "ticker": "AAPL", "name": "Apple Inc.", "sector": "Technology",
        "industry": "Consumer Electronics", "market_cap": FUND["market_cap"],
        "scores": scores, "technicals": tech, "fundamentals": FUND,
        "news": {"sentiment_score": 0.12, "volume": 340,
                 "headlines": ["Apple unveils new AI features", "Services revenue hits record"]},
        "filings": [], "market": {"regime": "risk-on", "spx_trend": "uptrend"},
    }
    print("Generating GLM-5.2 research note for AAPL...\n")
    rep = generate_report(ctx, reasoning_effort="low")

    print("RECOMMENDATION:", rep["recommendation"], "| confidence:", rep["confidence"])
    print("MODEL:", rep["model"], "| tokens:", rep["tokens_used"])
    print("\nTHESIS:\n", (rep["thesis"] or "")[:600])
    print("\nBULL:\n", (rep["bull_case"] or "")[:300])
    print("\nBEAR:\n", (rep["bear_case"] or "")[:300])
    print("\nCATALYSTS:", json.dumps(rep["catalysts"][:2], indent=2)[:500])
    print("\nRISKS:", json.dumps(rep["risks"][:2], indent=2)[:500])


if __name__ == "__main__":
    main()
