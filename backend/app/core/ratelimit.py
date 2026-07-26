"""Rate limiting without Redis.

Per-minute caps use in-process fixed-window counters (fine for a single-process
deploy). Daily budgets (FMP 250/day, Polygon 7200/day) are persisted in Postgres
(`provider_usage`) so they survive restarts and can't be reset by a redeploy.
"""

from __future__ import annotations

import random
import threading
import time
from datetime import date

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.logging import get_logger

log = get_logger("ratelimit")

_minute_counts: dict[tuple[str, int], int] = {}
_lock = threading.Lock()


class RateLimited(Exception):
    def __init__(self, provider: str, retry_after: float):
        self.provider = provider
        self.retry_after = retry_after
        super().__init__(f"{provider} rate limited; retry in {retry_after:.1f}s")


class BudgetExhausted(Exception):
    def __init__(self, provider: str, scope: str):
        self.provider = provider
        self.scope = scope
        super().__init__(f"{provider} {scope} budget exhausted")


def _incr_minute(name: str) -> int:
    wid = int(time.time() // 60)
    with _lock:
        # opportunistic cleanup of stale windows
        if len(_minute_counts) > 256:
            for k in [k for k in _minute_counts if k[1] < wid - 1]:
                _minute_counts.pop(k, None)
        key = (name, wid)
        c = _minute_counts.get(key, 0) + 1
        _minute_counts[key] = c
        return c


def _incr_daily(name: str) -> int:
    from app.db.models import ProviderUsage
    from app.db.session import session_scope

    with session_scope() as s:
        stmt = (
            pg_insert(ProviderUsage)
            .values(provider=name, day=date.today(), count=1)
            .on_conflict_do_update(
                index_elements=["provider", "day"],
                set_={"count": ProviderUsage.count + 1},
            )
            .returning(ProviderUsage.count)
        )
        return int(s.execute(stmt).scalar_one())


def _get_daily(name: str) -> int:
    from app.db.models import ProviderUsage
    from app.db.session import session_scope

    with session_scope() as s:
        return int(s.scalar(select(ProviderUsage.count).where(
            ProviderUsage.provider == name, ProviderUsage.day == date.today())) or 0)


class Throttle:
    def __init__(self, name: str, *, per_min: int | None = None,
                 per_day: int | None = None, max_wait: float = 90.0):
        self.name = name
        self.per_min = per_min
        self.per_day = per_day
        self.max_wait = max_wait

    def acquire(self) -> None:
        if self.per_day is not None:
            if _incr_daily(self.name) > self.per_day:
                log.warning("daily budget exhausted", extra={"provider": self.name})
                raise BudgetExhausted(self.name, "daily")

        if self.per_min is not None:
            deadline = time.time() + self.max_wait
            while True:
                if _incr_minute(self.name) <= self.per_min:
                    return
                retry_after = 60 - (time.time() % 60)
                if time.time() + retry_after > deadline:
                    raise RateLimited(self.name, retry_after)
                time.sleep(retry_after + random.uniform(0.05, 0.4))

    def remaining_day(self) -> int | None:
        if self.per_day is None:
            return None
        return max(0, self.per_day - _get_daily(self.name))
