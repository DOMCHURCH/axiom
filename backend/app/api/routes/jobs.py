"""Async job status — drives the 'Find Best Stocks' progress UI."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_auth
from app.db.models import Job
from app.db.session import get_db

router = APIRouter(prefix="/jobs", tags=["jobs"], dependencies=[Depends(require_auth)])


def _job(j: Job) -> dict:
    return {"id": j.id, "type": j.type, "status": j.status, "progress": j.progress,
            "stage": j.stage, "result_ref": j.result_ref, "error": j.error,
            "updated_at": j.updated_at}


@router.get("/{job_id}")
async def get_job(job_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    job = await db.get(Job, job_id)
    if job is None:
        raise HTTPException(404, "job not found")
    return _job(job)


@router.get("")
async def list_jobs(limit: int = 20, db: AsyncSession = Depends(get_db)) -> dict:
    rows = (await db.execute(select(Job).order_by(desc(Job.updated_at)).limit(limit))).scalars().all()
    return {"jobs": [_job(j) for j in rows]}
