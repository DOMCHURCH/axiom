"""Runtime key/value settings (DB-backed) — the in-app automation switch etc.

Best-effort: on any DB error we fall back to env defaults so nothing blocks.
"""

from __future__ import annotations

from app.core.logging import get_logger

log = get_logger("app_settings")


def get(key: str, default: str | None = None) -> str | None:
    from app.db.models import AppSetting
    from app.db.session import session_scope
    try:
        with session_scope() as s:
            row = s.get(AppSetting, key)
            return row.value if row and row.value is not None else default
    except Exception:  # noqa: BLE001
        return default


def set(key: str, value: str) -> None:
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    from app.db.models import AppSetting
    from app.db.session import session_scope
    with session_scope() as s:
        stmt = (pg_insert(AppSetting).values(key=key, value=value)
                .on_conflict_do_update(index_elements=["key"], set_={"value": value}))
        s.execute(stmt)


def automation_enabled() -> bool:
    """True if the in-app switch is ON. Falls back to the WATCH_ENABLED env default
    only when the switch was never set."""
    from app.config import settings
    v = get("automation_enabled")
    if v is None:
        return settings.watch_enabled
    return v == "true"


def alert_recipient() -> str:
    """Where automation emails go: the in-app email, else WATCH_EMAIL/ALERT_EMAIL."""
    from app.config import settings
    return (get("automation_email") or settings.watch_email or settings.alert_email or "").strip()
