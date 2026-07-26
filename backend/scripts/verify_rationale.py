import json

from app.quant.rationale import build_rationale

rec = {
    "ticker": "UNP", "strategy": "trend_following", "strategy_label": "Trend Following",
    "confidence": 77, "overall_score": 82.4, "risk_level": "low",
    "setup": {"current_price": 304.0, "entry_low": 301.84, "entry_high": 306.69,
              "stop_loss": 298.30, "target_1": 312.27, "target_2": 315.90,
              "risk_reward_1": 1.5, "holding_days": 5, "regime": "up"},
    "strategy_signals": {"trend_following": 82, "momentum": 68, "relative_strength": 61, "breakout": 40},
    "allocation": {"weight_pct": 12, "invested_dollars": 912, "shares": 3},
}
print(json.dumps(build_rationale(rec), indent=2))
print("\n--- zero-share case ---")
rec["allocation"] = {"weight_pct": 5.3, "invested_dollars": 0, "shares": 0}
rec["ticker"] = "URI"
rec["setup"]["current_price"] = 1145.0
print(build_rationale(rec)["allocation_note"])
