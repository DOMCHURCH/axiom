"""Lifetime GLM-5.2 token budget — keeps AI spend bounded so it lasts.

Cumulative token usage is tracked in `provider_usage` (rows keyed by day; the
lifetime total is their sum). When the total reaches `settings.ai_token_budget`
(default 100,000) further analysis is refused until the cap is raised. All DB
access is best-effort: if the DB is unavailable, budgeting no-ops rather than
blocking (so local/offline use still works).
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.config import settings
from app.core.logging import get_logger
from app.db.models import ProviderUsage
from app.db.session import session_scope

log = get_logger("ai_budget")

TOKEN_PROVIDER = "openrouter_tokens"


class AIBudgetExhausted(Exception):
    pass


def tokens_used() -> int:
    with session_scope() as s:
        return int(s.scalar(
            select(func.coalesce(func.sum(ProviderUsage.count), 0))
            .where(ProviderUsage.provider == TOKEN_PROVIDER)) or 0)


def tokens_remaining() -> int:
    try:
        return max(0, settings.ai_token_budget - tokens_used())
    except Exception:
        return settings.ai_token_budget


def tokens_used_today() -> int:
    with session_scope() as s:
        return int(s.scalar(
            select(func.coalesce(func.sum(ProviderUsage.count), 0))
            .where(ProviderUsage.provider == TOKEN_PROVIDER,
                   ProviderUsage.day == date.today())) or 0)


def daily_remaining() -> int:
    try:
        return max(0, settings.ai_daily_token_budget - tokens_used_today())
    except Exception:
        return settings.ai_daily_token_budget


def check_daily_budget() -> None:
    """Raise AIBudgetExhausted if today's GLM token cap is reached."""
    try:
        used = tokens_used_today()
    except Exception:
        return
    if used >= settings.ai_daily_token_budget:
        raise AIBudgetExhausted(
            f"Daily AI token budget of {settings.ai_daily_token_budget:,} reached "
            f"(used {used:,} today).")


def check_budget() -> None:
    """Raise AIBudgetExhausted if the lifetime token cap is reached."""
    try:
        used = tokens_used()
    except Exception:
        return  # DB unavailable -> best-effort, don't block
    if used >= settings.ai_token_budget:
        raise AIBudgetExhausted(
            f"AI token budget of {settings.ai_token_budget:,} reached "
            f"(used {used:,}). Raise AI_TOKEN_BUDGET to continue."
        )


def add_tokens(n: int | None) -> None:
    if not n:
        return
    try:
        with session_scope() as s:
            stmt = pg_insert(ProviderUsage).values(
                provider=TOKEN_PROVIDER, day=date.today(), count=int(n))
            stmt = stmt.on_conflict_do_update(
                index_elements=["provider", "day"],
                set_={"count": ProviderUsage.count + int(n)})
            s.execute(stmt)
    except Exception as exc:  # best-effort accounting
        log.debug("token accounting failed", extra={"err": str(exc)})
