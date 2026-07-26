"""Verify trading strategy signals on real Yahoo data. No DB/keys needed."""

from __future__ import annotations

from app.data import yahoo
from app.quant.strategies import compute_strategy_signals
from app.quant.technical import compute_technicals

TICKERS = ["NVDA", "MSFT", "AAPL", "KO", "PLTR", "AMD"]


def bench() -> dict:
    spy = yahoo.fetch_ohlcv("SPY", period="1y")
    t = compute_technicals(spy) or {}
    ex = t.get("extra") or {}
    return {"return_1m": ex.get("return_1m"), "return_3m": ex.get("return_3m")}


def main() -> None:
    benchmark = bench()
    print("SPY benchmark:", benchmark, "\n")
    frames = yahoo.fetch_prices_bulk(TICKERS, period="1y")
    for t in TICKERS:
        df = frames.get(t)
        if df is None or df.empty:
            print(t, "no data"); continue
        tech = compute_technicals(df)
        res = compute_strategy_signals(df, tech, benchmark)
        sig = res["signals"]
        top = sorted(((k, v) for k, v in sig.items() if v is not None), key=lambda x: -x[1])[:4]
        print(f"{t:5}  price={tech['last_price']:.2f}  rsi={tech['rsi']:.0f}")
        print("      top setups:", ", ".join(f"{k}={v:.0f}" for k, v in top))


if __name__ == "__main__":
    main()
