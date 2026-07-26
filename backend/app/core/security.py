"""Single-user bearer-token authentication.

There is exactly one credential: `settings.app_token`. Any request presenting it
in `Authorization: Bearer <token>` is authenticated. No user table, no sessions.
Comparison is constant-time to avoid timing oracles.
"""

from __future__ import annotations

import secrets


def token_is_valid(presented: str | None) -> bool:
    if not presented:
        return False
    expected = settings_token()
    if not expected:
        # An unset token means auth is effectively disabled; refuse rather than
        # silently allow everything in that misconfiguration.
        return False
    return secrets.compare_digest(presented, expected)


def settings_token() -> str:
    # imported lazily so tests can monkeypatch settings
    from app.config import settings

    return settings.app_token or ""
