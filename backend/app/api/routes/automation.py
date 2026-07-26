"""In-app automation switch — start/stop the 24/7 Market Watch (persisted)."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.deps import require_auth
from app.config import settings

router = APIRouter(prefix="/automation", tags=["automation"], dependencies=[Depends(require_auth)])


class ToggleBody(BaseModel):
    enabled: bool
    email: str | None = None


def _status() -> dict:
    from app.data import agentmail
    from app.services import app_settings

    enabled = app_settings.automation_enabled()
    email = app_settings.alert_recipient()
    agent_ok = agentmail.configured()
    return {
        "enabled": enabled,
        "agentmail_configured": agent_ok,
        "has_email": bool(email),
        "email": email or None,
        "running": bool(enabled and agent_ok and email),
        "config": {
            "interval_min": settings.watch_interval_min,
            "min_score": settings.watch_min_score,
            "min_confidence": settings.watch_min_confidence,
            "max_per_day": settings.watch_max_per_day,
            "capital": settings.watch_capital,
            "horizon": settings.watch_horizon,
            "extended_hours": settings.watch_extended_hours,
        },
    }


@router.get("")
async def get_status() -> dict:
    return await asyncio.to_thread(_status)


@router.post("")
async def toggle(body: ToggleBody) -> dict:
    from app.services import app_settings

    def _apply():
        if body.email is not None:
            app_settings.set("automation_email", body.email.strip())
        app_settings.set("automation_enabled", "true" if body.enabled else "false")
        return _status()

    return await asyncio.to_thread(_apply)
