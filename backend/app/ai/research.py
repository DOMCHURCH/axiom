"""Equity research report generation with GLM-5.2.

The model receives ONLY numbers computed in Python (scores, indicators, ratios),
plus news sentiment and SEC filing excerpts, and writes the narrative. It must not
invent figures. Output is strict JSON mapped onto the ai_reports fields.
"""

from __future__ import annotations

import json

import orjson

from app.ai.openrouter import chat
from app.core.logging import get_logger

log = get_logger("research")

ALLOWED_RATINGS = ["Strong Buy", "Buy", "Hold", "Watch", "Avoid"]

SYSTEM_PROMPT = """You are a senior equity research analyst writing an institutional-grade \
research note. You are rigorous, balanced, and skeptical.

HARD RULES:
- Use ONLY the quantitative figures provided in the DATA block. Never invent or \
estimate numbers that are not given. If a metric is missing, say so plainly.
- All math is already done for you. Do not recompute or contradict the provided \
scores and metrics — interpret them.
- Be specific and evidence-based. Reference the actual figures (e.g. "ROIC of 18%").
- Give a genuinely balanced bull AND bear case. Do not be a cheerleader.
- Your recommendation must be one of exactly: Strong Buy, Buy, Hold, Watch, Avoid.
- confidence is an integer 0-100 reflecting how strong and consistent the evidence is.

Return ONLY a JSON object with these keys (no prose outside JSON):
{
  "company_overview": string,
  "thesis": string,
  "bull_case": string,
  "bear_case": string,
  "catalysts": [{"title": string, "detail": string}],
  "risks": [{"title": string, "detail": string, "severity": "low"|"medium"|"high"}],
  "technical_analysis": string,
  "fundamental_analysis": string,
  "recommendation": "Strong Buy"|"Buy"|"Hold"|"Watch"|"Avoid",
  "confidence": integer
}"""


def _fmt(v, pct: bool = False, money: bool = False) -> str:
    if v is None:
        return "n/a"
    try:
        if pct:
            return f"{float(v) * 100:.1f}%"
        if money:
            return f"${float(v):,.0f}"
        return f"{float(v):,.2f}"
    except (TypeError, ValueError):
        return str(v)


def build_user_prompt(ctx: dict) -> str:
    s = ctx.get("scores") or {}
    t = ctx.get("technicals") or {}
    te = t.get("extra") or {}
    f = ctx.get("fundamentals") or {}
    val = (f.get("valuation_metrics") or {})
    news = ctx.get("news") or {}
    filings = ctx.get("filings") or []
    market = ctx.get("market") or {}

    headlines = "\n".join(f"  - {h}" for h in (news.get("headlines") or [])[:8]) or "  (none)"
    excerpts = "\n\n".join(
        f"  [Filing excerpt {i + 1}]: {e.get('content', '')[:1200]}"
        for i, e in enumerate(filings[:4])
    ) or "  (no filing excerpts available)"

    return f"""COMPANY: {ctx.get('name')} ({ctx.get('ticker')})
Sector: {ctx.get('sector')}  |  Industry: {ctx.get('industry')}  |  Market cap: {_fmt(ctx.get('market_cap'), money=True)}

QUANT SCORES (0-100; risk: higher = safer):
  Technical {s.get('technical_score')} | Fundamental {s.get('fundamental_score')} | \
Growth {s.get('growth_score')} | Value {s.get('value_score')} | \
Quality {s.get('quality_score')} | Risk {s.get('risk_score')}
  COMPOSITE {s.get('total_score')}  ->  quant recommendation: {s.get('recommendation')}

TECHNICALS:
  Last price {_fmt(t.get('last_price'))} | RSI {_fmt(t.get('rsi'))} | Trend score {t.get('trend_score')}
  SMA50 {_fmt(t.get('sma_50'))} | SMA200 {_fmt(t.get('sma_200'))} | MACD hist {_fmt(t.get('macd_hist'))}
  Momentum {_fmt(t.get('momentum'), pct=True)} | Volatility {_fmt(t.get('volatility'), pct=True)} | \
Drawdown {_fmt(t.get('drawdown'), pct=True)}
  Return 3m {_fmt(te.get('return_3m'), pct=True)} | 12m {_fmt(te.get('return_12m'), pct=True)} | \
% from 52w high {_fmt(te.get('pct_from_52w_high'), pct=True)}

FUNDAMENTALS:
  Revenue {_fmt(f.get('revenue'), money=True)} (growth {_fmt(f.get('revenue_growth'), pct=True)})
  Earnings {_fmt(f.get('earnings'), money=True)} (growth {_fmt(f.get('earnings_growth'), pct=True)}) | \
EPS {_fmt(f.get('eps'))}
  Gross margin {_fmt(f.get('gross_margin'), pct=True)} | Operating margin {_fmt(f.get('operating_margin'), pct=True)} | \
Net margin {_fmt(f.get('net_margin'), pct=True)}
  Free cash flow {_fmt(f.get('free_cash_flow'), money=True)} (growth {_fmt(f.get('fcf_growth'), pct=True)})
  ROIC {_fmt(f.get('roic'), pct=True)} | ROE {_fmt(f.get('roe'), pct=True)} | \
Debt/Equity {_fmt(f.get('debt_to_equity'))} | Current ratio {_fmt(f.get('current_ratio'))}
  Valuation: P/E {_fmt(val.get('pe'))} | P/S {_fmt(val.get('ps'))} | P/B {_fmt(val.get('pb'))} | \
EV/EBITDA {_fmt(val.get('ev_ebitda'))} | PEG {_fmt(val.get('peg'))} | FCF yield {_fmt(val.get('fcf_yield'), pct=True)}

NEWS SENTIMENT (GDELT): score {news.get('sentiment_score')} over {news.get('volume')} articles
RECENT HEADLINES:
{headlines}

SEC FILING EXCERPTS (most relevant, retrieved):
{excerpts}

MARKET CONDITIONS: {market or 'n/a'}

Write the research note as strict JSON per the schema."""


def _extract_json(content: str) -> dict | None:
    if not content:
        return None
    text = content.strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1]
        if text.lstrip().lower().startswith("json"):
            text = text.lstrip()[4:]
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        return None
    blob = text[start:end + 1]
    for parser in (orjson.loads, json.loads):
        try:
            return parser(blob)
        except Exception:
            continue
    return None


def generate_report(ctx: dict, *, model: str | None = None,
                    reasoning_effort: str = "low") -> dict:
    """Call GLM-5.2 and return a normalized report dict ready to persist."""
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": build_user_prompt(ctx)},
    ]
    result = chat(messages, model=model, temperature=0.35, max_tokens=5000,
                  json_mode=True, reasoning={"effort": reasoning_effort})
    parsed = _extract_json(result.get("content") or "")
    if not parsed:
        raise ValueError("model did not return parseable JSON report")

    rec = parsed.get("recommendation")
    if rec not in ALLOWED_RATINGS:
        rec = (ctx.get("scores") or {}).get("recommendation") or "Hold"
    try:
        confidence = max(0, min(100, int(round(float(parsed.get("confidence", 50))))))
    except (TypeError, ValueError):
        confidence = 50

    usage = result.get("usage") or {}
    return {
        "model": result.get("model"),
        "company_overview": parsed.get("company_overview"),
        "thesis": parsed.get("thesis"),
        "bull_case": parsed.get("bull_case"),
        "bear_case": parsed.get("bear_case"),
        "catalysts": parsed.get("catalysts") or [],
        "risks": parsed.get("risks") or [],
        "technical_analysis": parsed.get("technical_analysis"),
        "fundamental_analysis": parsed.get("fundamental_analysis"),
        "recommendation": rec,
        "confidence": confidence,
        "tokens_used": usage.get("total_tokens"),
        "scores_snapshot": ctx.get("scores"),
    }
