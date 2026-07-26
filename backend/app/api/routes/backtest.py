"""Strategy backtest endpoints — run it, read the latest learned edge/weights."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends

from app.api.deps import require_auth

router = APIRouter(prefix="/backtest", tags=["backtest"], dependencies=[Depends(require_auth)])


@router.get("")
async def get_latest() -> dict:
    from app.services.backtest import latest
    result = await asyncio.to_thread(latest)
    return result if result else {"available": False}


@router.post("/run")
async def run() -> dict:
    from app.worker.runner import submit_backtest
    return {"job_id": submit_backtest()}
