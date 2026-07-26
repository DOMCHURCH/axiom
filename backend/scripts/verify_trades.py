"""Full trade candidate on real data: signals -> trade score -> setup. No DB/keys."""

from __future__ import annotations

from app.data import yahoo
from app.quant.strategies import compute_strategy_signals
from app.quant.technical import compute_technicals
from app.quant.trade_scoring import compute_trade_scores
from app.quant.trade_setup import generate_setup

TICKERS = ["NVDA", "AMD", "AAPL", "MSFT", "PLTR"]
HORIZON = "1w"


def bench():
    t = compute_technicals(yahoo.fetch_ohlcv("SPY", period="1y")) or {}
    ex = t.get("extra") or {}
    return {"return_1m": ex.get("return_1m"), "return_3m": ex.get("return_3m")}


def main():
    benchmark = bench()
    frames = yahoo.fetch_prices_bulk(TICKERS, period="1y")
    print(f"Holding period: {HORIZON}\n")
    for t in TICKERS:
        df = frames.get(t)
        if df is None or df.empty:
            continue
        tech = compute_technicals(df)
        res = compute_strategy_signals(df, tech, benchmark)
        sc = compute_trade_scores(res["signals"], res["features"], tech, None, None, HORIZON)
        setup = generate_setup(res["features"], HORIZON)
        print(f"=== {t}  |  {sc['best_strategy_label']}  |  Trade Score {sc['overall_score']}  (conf {sc['confidence']}) ===")
        print(f"    entry {setup['entry_low']}–{setup['entry_high']}  stop {setup['stop_loss']}  "
              f"T1 {setup['target_1']}  T2 {setup['target_2']}  R/R {setup['risk_reward_1']}:1 / {setup['risk_reward_2']}:1  "
              f"risk={setup['risk_level']}")
        subs = {k.replace('_score', ''): v for k, v in sc['sub_scores'].items()}
        print(f"    subs {subs}")


if __name__ == "__main__":
    main()
