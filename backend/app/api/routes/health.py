"""Liveness / readiness endpoint (unauthenticated) for Railway health checks."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app import __version__
from app.config import settings
from app.db.session import get_db

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(db: AsyncSession = Depends(get_db)) -> dict:
    db_ok = False
    try:
        await db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False
    return {
        "status": "ok" if db_ok else "degraded",
        "db": db_ok,
        "version": __version__,
        # Which build is actually running. Railway injects these automatically,
        # so a stale deploy is visible at a glance instead of being guessed at
        # from UI symptoms.
        "commit": settings.git_sha[:7] if settings.git_sha else None,
        "branch": settings.git_branch or None,
        "scan": {
            "universe": settings.scan_universe,
            "prefilter_keep": settings.scan_prefilter_keep,
            "deep_seconds": settings.scan_deep_seconds,
            "technical_keep": settings.scan_technical_keep,
            "enrich_seconds": settings.scan_enrich_seconds,
            "fmp_key": bool(settings.fmp_api_key),
        },
    }
