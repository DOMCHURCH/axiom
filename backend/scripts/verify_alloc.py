"""Test allocation on real candidates. No DB/keys."""

from __future__ import annotations

from app.data import yahoo
from app.quant.allocation import allocate
from app.quant.strategies import compute_strategy_signals
from app.quant.technical import compute_technicals
from app.quant.trade_scoring import compute_trade_scores

SECTOR = {"NVDA": "Semiconductors", "AMD": "Semiconductors", "AVGO": "Semiconductors",
          "MSFT": "Software", "META": "Communication", "GOOGL": "Communication"}
CAPITAL = 10_000
HORIZON = "1w"


def bench():
    t = compute_technicals(yahoo.fetch_ohlcv("SPY", period="1y")) or {}
    ex = t.get("extra") or {}
    return {"return_1m": ex.get("return_1m"), "return_3m": ex.get("return_3m")}


def main():
    benchmark = bench()
    frames = yahoo.fetch_prices_bulk(list(SECTOR), period="1y")
    cands = []
    for t in SECTOR:
        df = frames.get(t)
        if df is None or df.empty:
            continue
        tech = compute_technicals(df)
        res = compute_strategy_signals(df, tech, benchmark)
        sc = compute_trade_scores(res["signals"], res["features"], tech, None, None, HORIZON)
        rets = df["adj_close"].pct_change().dropna().tolist()[-120:]
        cands.append({
            "ticker": t, "confidence": sc["confidence"], "atr_pct": res["features"].get("atr_pct"),
            "sector": SECTOR[t], "price": tech["last_price"],
            "avg_dollar_volume": (tech.get("extra") or {}).get("avg_dollar_volume"), "returns": rets,
        })
    cands.sort(key=lambda c: -(c["confidence"] or 0))
    alloc = allocate(CAPITAL, cands, max_positions=6)

    print(f"Capital ${alloc['capital']:,.0f}  invested ${alloc['invested']:,.0f}  cash ${alloc['cash']:,.0f}\n")
    for p in alloc["positions"]:
        print(f"  {p['ticker']:5} {p['weight_pct']:5.1f}%  ${p['target_dollars']:>8,.0f}  "
              f"{p['shares']:>4} sh @ ${p['price']:.2f}  conf {p['confidence']}  [{p['sector']}]")
    print("\n  sector exposure:", alloc["sector_exposure"])


if __name__ == "__main__":
    main()
