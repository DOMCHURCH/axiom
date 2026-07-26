"""AI trade thesis with GLM-5.2 — narrates a trade setup the Python engine built.

The model receives the computed setup (entry/stop/targets/R:R), the trading
sub-scores, and news/fundamental context, and explains the trade. It never
invents price levels or numbers — those are given.
"""

from __future__ import annotations

from app.ai.openrouter import chat
from app.ai.research import _extract_json
from app.core.logging import get_logger

log = get_logger("trade_report")

SYSTEM_PROMPT = """You are a professional short-term trading analyst writing a concise, \
punchy trade brief for a discretionary trader. You are precise and honest about risk.

HARD RULES:
- Use ONLY the numbers provided (entry, stop, targets, R:R, scores). Never invent \
price levels or figures. All math is already done — interpret it.
- This is a SHORT-TERM trade for the stated holding period, not a long-term investment.
- Explain specifically why the setup fits its primary strategy.
- Be balanced: state the key risks and what would invalidate the trade (the stop).
- This is research/decision-support only. Do NOT promise outcomes or give financial advice.

Return ONLY JSON with these keys:
{
  "trading_thesis": string,          // 2-4 sentences: the core trade idea for this horizon
  "why_matches_strategy": string,    // why it fits the primary strategy, citing the signals
  "technical_summary": string,
  "fundamental_summary": string,     // brief; "limited data" if fundamentals are sparse
  "news_summary": string,            // brief; based only on provided headlines/sentiment
  "key_risks": [string],             // 2-4 concrete risks incl. what breaks the setup
  "confidence_note": string          // one line on how strong/clean the setup is
}"""


def _fmt(v, d=2):
    return "n/a" if v is None else (f"{float(v):.{d}f}" if isinstance(v, (int, float)) else str(v))


def build_prompt(ctx: dict) -> str:
    s = ctx.get("setup") or {}
    sub = ctx.get("sub_scores") or {}
    headlines = "\n".join(f"  - {h}" for h in (ctx.get("headlines") or [])[:6]) or "  (none)"
    f = ctx.get("fundamentals") or {}
    return f"""TRADE CANDIDATE: {ctx.get('name')} ({ctx.get('ticker')})
Sector: {ctx.get('sector')}  |  Holding period: {ctx.get('horizon_label')}
Primary strategy: {ctx.get('strategy_label')}

TRADE SETUP (computed):
  Current price {_fmt(s.get('current_price'))}
  Entry zone {_fmt(s.get('entry_low'))} – {_fmt(s.get('entry_high'))}
  Stop loss {_fmt(s.get('stop_loss'))}  ({ctx.get('risk_level')} risk)
  Target 1 {_fmt(s.get('target_1'))}  (R:R {_fmt(s.get('risk_reward_1'))}:1)
  Target 2 {_fmt(s.get('target_2'))}  (R:R {_fmt(s.get('risk_reward_2'))}:1)
  Support {_fmt(s.get('support'))}  Resistance {_fmt(s.get('resistance'))}  ATR% {_fmt((s.get('atr_pct') or 0)*100,1)}

TRADING SCORES (0-100): overall {ctx.get('overall_score')}  confidence {ctx.get('confidence')}
  momentum {sub.get('momentum_score')} | breakout {sub.get('breakout_score')} | trend {sub.get('trend_score')} |
  volume {sub.get('volume_score')} | volatility {sub.get('volatility_score')} |
  fundamental {sub.get('fundamental_score')} | sentiment {sub.get('sentiment_score')} | risk {sub.get('risk_score')}
STRATEGY SIGNALS: {ctx.get('strategy_signals')}

FUNDAMENTAL SNAPSHOT: revenue_growth {f.get('revenue_growth')}, net_margin {f.get('net_margin')}, roe {f.get('roe')} (may be sparse for a short-term trade)
NEWS SENTIMENT: {ctx.get('sentiment')}
RECENT HEADLINES:
{headlines}

Write the trade brief as strict JSON per the schema."""


REVIEW_SYSTEM = """You are a trading risk manager re-evaluating an OPEN trade. Compare the \
original thesis with current market conditions and judge whether the setup is improving, \
holding, or weakening. Use only the numbers provided. Research/decision-support only.

Return ONLY JSON:
{
  "verdict": "improving" | "intact" | "weakening" | "invalidated",
  "explanation": string,   // 2-3 sentences citing the current numbers
  "action": string         // e.g. "hold", "tighten stop", "take partial profit", "exit"
}"""


def generate_review(ctx: dict, *, reasoning_effort: str = "low") -> dict:
    prompt = f"""OPEN TRADE: {ctx.get('ticker')} ({ctx.get('strategy_label')}, {ctx.get('horizon_label')})
Original: entry {ctx.get('entry_price')}, stop {ctx.get('stop_loss')}, targets {ctx.get('target_1')}/{ctx.get('target_2')}, confidence {ctx.get('original_confidence')}
Now: price {ctx.get('current_price')} ({ctx.get('pl_pct')} P/L), days held {ctx.get('days_held')}/{ctx.get('holding_days')}
Current trading scores: overall {ctx.get('current_overall')}, confidence {ctx.get('current_confidence')}, trend {ctx.get('trend_score')}, momentum {ctx.get('momentum_score')}
Distance to stop {ctx.get('dist_to_stop_pct')}, distance to target1 {ctx.get('dist_to_t1_pct')}
Original thesis: {ctx.get('original_thesis')}

Judge the trade as strict JSON per the schema."""
    result = chat([{"role": "system", "content": REVIEW_SYSTEM}, {"role": "user", "content": prompt}],
                  temperature=0.35, max_tokens=3000, json_mode=True, reasoning={"effort": reasoning_effort})
    parsed = _extract_json(result.get("content") or "") or {}
    return {
        "verdict": parsed.get("verdict", "intact"),
        "explanation": parsed.get("explanation"),
        "action": parsed.get("action"),
        "current_confidence": ctx.get("current_confidence"),
        "model": result.get("model"),
    }


def generate_trade_thesis(ctx: dict, *, reasoning_effort: str = "low") -> dict:
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": build_prompt(ctx)},
    ]
    result = chat(messages, temperature=0.4, max_tokens=4000, json_mode=True,
                  reasoning={"effort": reasoning_effort})
    parsed = _extract_json(result.get("content") or "")
    if not parsed:
        raise ValueError("model did not return parseable JSON trade thesis")
    return {
        "trading_thesis": parsed.get("trading_thesis"),
        "why_matches_strategy": parsed.get("why_matches_strategy"),
        "technical_summary": parsed.get("technical_summary"),
        "fundamental_summary": parsed.get("fundamental_summary"),
        "news_summary": parsed.get("news_summary"),
        "key_risks": parsed.get("key_risks") or [],
        "confidence_note": parsed.get("confidence_note"),
        "model": result.get("model"),
        "tokens_used": (result.get("usage") or {}).get("total_tokens"),
    }
