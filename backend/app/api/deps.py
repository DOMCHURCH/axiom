"""Shared FastAPI dependencies: DB session + optional token auth.

AXIOM ships with NO login. `require_auth` is a no-op unless an APP_TOKEN is
configured, in which case it re-enables single-user bearer-token protection.
"""

from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.security import token_is_valid
from app.db.session import get_db

_bearer = HTTPBearer(auto_error=False)


async def require_auth(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> None:
    """Open by default. Only enforces a token when APP_TOKEN is set."""
    if not settings.app_token:
        return  # no login configured — public API
    presented = creds.credentials if creds else None
    if not token_is_valid(presented):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing token",
            headers={"WWW-Authenticate": "Bearer"},
        )


# re-export for convenience
DBSession = Depends(get_db)
AuthGuard = Depends(require_auth)

__all__ = ["require_auth", "get_db", "AsyncSession", "DBSession", "AuthGuard"]
