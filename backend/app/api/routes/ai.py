"""AI brief endpoints — the daily GLM-5.2 market note."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends

from app.api.deps import require_auth

router = APIRouter(prefix="/ai", tags=["ai"], dependencies=[Depends(require_auth)])


def _status() -> dict:
    from app.ai.budget import daily_remaining
    from app.config import settings
    ready = bool(settings.ai_brief_enabled and settings.openrouter_api_key)
    remaining = daily_remaining() if settings.openrouter_api_key else 0
    return {
        "available": False,
        "ready": ready and remaining > 0,
        "reason": (
            "The AI brief is turned off." if not settings.ai_brief_enabled
            else "Add OPENROUTER_API_KEY to the backend to enable the AI brief." if not settings.openrouter_api_key
            else "Today's AI budget is used up — resets tomorrow." if remaining <= 0
            else "No brief yet today — generate GLM-5.2's read on the market."
        ),
        "daily_remaining": remaining,
    }


@router.get("/brief")
async def get_brief() -> dict:
    from app.services.ai_brief import get_cached_brief
    cached = await asyncio.to_thread(get_cached_brief)
    return cached if cached is not None else _status()


@router.post("/brief/refresh")
async def refresh_brief() -> dict:
    from app.services.ai_brief import generate_brief
    return await asyncio.to_thread(generate_brief, True)
