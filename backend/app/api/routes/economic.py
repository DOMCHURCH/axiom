"""Macro / economic backdrop endpoint — FRED indicators + FMP calendar."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends

from app.api.deps import require_auth

router = APIRouter(prefix="/economic", tags=["economic"], dependencies=[Depends(require_auth)])


@router.get("")
async def economic() -> dict:
    from app.core.logging import get_logger
    from app.services.economic import economic_snapshot
    try:
        return await asyncio.to_thread(economic_snapshot)
    except Exception as exc:  # noqa: BLE001 — never 500 the dashboard on macro data
        get_logger("economic").warning("economic snapshot failed", extra={"err": str(exc)})
        return {
            "as_of": None, "available": False, "indicators": [], "calendar": [],
            "regime": {"stance": "Unavailable", "score": 0,
                       "summary": "Economic data is temporarily unavailable."},
            "sources": [],
        }
