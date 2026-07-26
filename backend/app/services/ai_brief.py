"""Daily AI market brief — the one budgeted GLM-5.2 job.

Once a day it reads the macro backdrop + today's strongest setups and has GLM-5.2
write a short, decisive morning note (what the market's doing, the best setups and
why, one risk). Capped by a separate DAILY token budget so it can recur forever
without draining the lifetime cap. Cached per calendar day; emailed each morning.
"""

from __future__ import annotations

from datetime import date, datetime, timezone

from app.core.cache import _key, cache_get, cache_set
from app.core.logging import get_logger

log = get_logger("ai_brief")

SYSTEM = (
    "You are the analyst on a short-term trading desk writing the morning note for one trader. "
    "Be concise, concrete and decisive — no hedging, no disclaimers, no headings, no bullet symbols. "
    "Write 3 short paragraphs, ~200 words total: (1) the market backdrop in a sentence or two and what "
    "it means for risk today; (2) the 2–3 best setups to focus on and why, referencing their levels; "
    "(3) one clear risk to watch. Plain text."
)


def _context() -> tuple[dict, list[str], list[str]]:
    from app.services.economic import economic_snapshot
    from app.services.trade_scanner import scan_top

    econ = economic_snapshot()
    regime = econ.get("regime") or {}
    ind_lines = [f"- {i['label']}: {i['value_fmt']} ({i['impact']})"
                 for i in (econ.get("indicators") or [])[:6]]

    setup_lines = []
    for c in scan_top("1w", min_score=70, min_conf=55, limit=6):
        sc, s = c["scores"], c["setup"]
        setup_lines.append(
            f"- {c['ticker']} ({sc.get('best_strategy_label')}): score {sc.get('overall_score')}, "
            f"conf {sc.get('confidence')}, entry ${s.get('entry_low')}-${s.get('entry_high')}, "
            f"stop ${s.get('stop_loss')}, targets ${s.get('target_1')}/${s.get('target_2')}")
    return regime, ind_lines, setup_lines


def _cache_key() -> str:
    return _key("ai_brief", date.today().isoformat())


def get_cached_brief() -> dict | None:
    return cache_get(_cache_key())


def generate_brief(force: bool = False) -> dict:
    """Generate (or return cached) today's brief. Guarded by the daily token budget."""
    from app.ai.budget import AIBudgetExhausted, check_daily_budget, daily_remaining
    from app.ai.openrouter import OpenRouterError, complete
    from app.config import settings

    if not force:
        hit = get_cached_brief()
        if hit is not None:
            return hit

    if not settings.ai_brief_enabled:
        return {"available": False, "reason": "The AI brief is turned off (AI_BRIEF_ENABLED=false)."}
    if not settings.openrouter_api_key:
        return {"available": False, "reason": "Add OPENROUTER_API_KEY to the backend to enable the AI brief."}
    try:
        check_daily_budget()
    except AIBudgetExhausted as exc:
        return {"available": False, "reason": str(exc)}

    try:
        regime, inds, setups = _context()
    except Exception as exc:  # noqa: BLE001
        log.warning("brief context failed", extra={"err": str(exc)})
        regime, inds, setups = {}, [], []

    user = (
        f"Market regime: {regime.get('stance', 'unknown')} — {regime.get('summary', '')}\n\n"
        f"Key indicators:\n" + ("\n".join(inds) if inds else "- (macro data unavailable)") + "\n\n"
        f"Today's strongest setups:\n" + ("\n".join(setups) if setups else "- (no standout setups)")
    )

    try:
        out = complete(SYSTEM, user, max_tokens=3500, temperature=0.4, reasoning={"effort": "low"})
    except OpenRouterError as exc:
        return {"available": False, "reason": f"AI brief failed: {exc}"}

    content = (out.get("content") or "").strip()
    if not content:
        return {"available": False, "reason": "AI returned an empty brief — try again."}

    result = {
        "available": True,
        "content": content,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "tokens": (out.get("usage") or {}).get("total_tokens"),
        "daily_remaining": daily_remaining(),
        "model": out.get("model"),
    }
    cache_set(_cache_key(), result, 26 * 3600)
    return result
