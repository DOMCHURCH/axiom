"""Manual verification: pull REAL prices from Yahoo and run the quant engine.
No database or API keys required. Run from backend/:
    PYTHONPATH=. .venv/Scripts/python.exe scripts/verify_quant.py
"""

from __future__ import annotations

from app.data import yahoo
from app.quant.scoring import compute_scores
from app.quant.technical import compute_technicals

TICKERS = ["AAPL", "MSFT", "NVDA", "KO"]

# Synthetic fundamentals just to exercise the fundamental/growth/value/quality/risk
# scorers end-to-end (real fundamentals come from FMP/SEC in the worker).
FUND = {
    "net_margin": 0.25, "operating_margin": 0.30, "roic": 0.20, "roe": 0.35,
    "free_cash_flow": 9.0e10, "debt_to_equity": 1.2, "current_ratio": 1.1,
    "revenue_growth": 0.08, "earnings_growth": 0.11, "eps_growth": 0.10, "fcf_growth": 0.09,
    "gross_margin": 0.45, "beta": 1.2, "market_cap": 2.5e12,
    "valuation_metrics": {"pe": 30, "ps": 8, "pb": 12, "ev_ebitda": 22,
                          "peg": 2.2, "fcf_yield": 0.03, "dividend_yield": 0.005},
}


def main() -> None:
    frames = yahoo.fetch_prices_bulk(TICKERS, period="1y")
    for t in TICKERS:
        df = frames.get(t)
        bars = 0 if df is None else len(df)
        tech = compute_technicals(df)
        print(f"\n=== {t}  (bars={bars}) ===")
        if not tech:
            print("  insufficient data")
            continue
        print(f"  price={tech['last_price']:.2f}  rsi={tech['rsi']}  "
              f"trend={tech['trend_score']}  mom={tech['momentum']}  vol={tech['volatility']}")
        print(f"  sma50={tech['sma_50']}  sma200={tech['sma_200']}  "
              f"drawdown={tech['drawdown']}  macd_hist={tech['macd_hist']}")
        sc = compute_scores(tech, FUND)
        subs = {k.replace("_score", ""): v for k, v in sc.items() if k.endswith("_score")}
        print(f"  scores={subs}")
        print(f"  TOTAL={sc['total_score']}  ->  {sc['recommendation']}")


if __name__ == "__main__":
    main()
