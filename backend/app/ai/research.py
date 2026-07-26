"""Equity research report generation with GLM-5.2.

The model receives ONLY numbers computed in Python (scores, indicators, ratios),
plus news sentiment and SEC filing excerpts, and writes the narrative. It must not
invent figures. Output is strict JSON mapped onto the ai_reports fields.
"""

from __future__ import annotations

import json
import math

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
- The VALUATION block (when present) is a Python-computed DCF and Monte Carlo run. \
Interpret it — the intrinsic value, the upside/downside vs the current price, how \
wide the P10-P90 distribution is, how dependent it is on the terminal value, and \
whether the stated assumptions (growth, WACC, beta) look demanding or conservative.
- price_target must be a single number in dollars per share drawn from the provided \
valuation ranges (e.g. near the DCF median or a blended midpoint), or null. If no \
VALUATION block is provided, price_target MUST be null and valuation_analysis must \
say that no intrinsic-value estimate was available. Never invent a target.

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
  "valuation_analysis": string,
  "price_target": number|null,
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


def _num_or_none(v) -> float | None:
    """Coerce a model-supplied number to a clean float, else None."""
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, str):
        v = v.strip().replace("$", "").replace(",", "")
        if not v:
            return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def _valuation_block(val: dict | None) -> str:
    """Render the Python-computed valuation for the prompt (empty when absent)."""
    if not val:
        return ""
    if val.get("intrinsic_value") is None and not (val.get("ranges") or []):
        return ""   # nothing was computable — show no block rather than all-n/a
    a = val.get("assumptions") or {}
    mc = val.get("monte_carlo") or {}
    d = val.get("dcf") or {}
    da = d.get("assumptions") or {}

    ranges = " | ".join(
        f"{r.get('label')} {_fmt(r.get('low'))}-{_fmt(r.get('high'))}"
        for r in (val.get("ranges") or [])) or "(none computable)"
    prob = mc.get("prob_above_price")
    missing = ", ".join(val.get("missing") or []) or "none"

    return f"""
VALUATION (two-stage DCF computed in Python — interpret it, do not recompute):
  Intrinsic value/share {_fmt(val.get('intrinsic_value'))} vs current price \
{_fmt(val.get('price'))}  ->  upside {_fmt(val.get('upside'), pct=True)}
  WACC {_fmt(val.get('wacc'), pct=True)} (beta {_fmt(a.get('beta'))} [{a.get('beta_source')}], \
risk-free {_fmt(a.get('risk_free'), pct=True)}, ERP {_fmt(a.get('equity_risk_premium'), pct=True)}, \
D/E {_fmt(a.get('debt_to_equity'))})
  Stage-1 FCF growth {_fmt(a.get('growth'), pct=True)} (source: {a.get('growth_source')}) fading to \
terminal {_fmt(a.get('terminal_growth'), pct=True)} over {a.get('years')} years
  Base FCF {_fmt(a.get('fcf'), money=True)} | net debt {_fmt(a.get('net_debt'), money=True)} | \
shares {_fmt(a.get('shares_outstanding'))}
  Enterprise value {_fmt(d.get('enterprise_value'), money=True)} | equity value \
{_fmt(d.get('equity_value'), money=True)} | terminal value is \
{_fmt(da.get('terminal_pct_of_value'), pct=True)} of it
  Monte Carlo ({mc.get('trials', 'n/a')} trials): P10 {_fmt(mc.get('p10'))} | median \
{_fmt(mc.get('median'))} | P90 {_fmt(mc.get('p90'))} | P(intrinsic > price) \
{_fmt(prob, pct=True)}
  Valuation ranges ($/share): {ranges}
  Missing/assumed inputs: {missing}
"""


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
{_valuation_block(ctx.get('valuation'))}
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

    # a price target is only allowed when Python actually computed a valuation
    price_target = _num_or_none(parsed.get("price_target"))
    if price_target is not None and (price_target <= 0
                                     or not ((ctx.get("valuation") or {}).get("ranges"))):
        price_target = None

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
        "valuation_analysis": parsed.get("valuation_analysis"),
        "price_target": price_target,
        "recommendation": rec,
        "confidence": confidence,
        "tokens_used": usage.get("total_tokens"),
        "scores_snapshot": ctx.get("scores"),
    }
