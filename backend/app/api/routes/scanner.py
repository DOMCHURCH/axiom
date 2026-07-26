"""Scanner endpoints — trigger 'Find Best Stocks' and read ranked results."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_auth
from app.db.models import Company, ScanResult, ScanRun
from app.db.session import get_db

router = APIRouter(prefix="/scanner", tags=["scanner"], dependencies=[Depends(require_auth)])


class ScanBody(BaseModel):
    universe_limit: int | None = None
    top_n: int | None = None
    technical_keep: int | None = None
    min_price: float | None = None
    min_dollar_vol: float | None = None
    enrich: bool | None = None
    weights: dict | None = None


def _run(r: ScanRun) -> dict:
    return {"id": r.id, "status": r.status, "stage": r.stage, "progress": r.progress,
            "universe_size": r.universe_size, "counts": r.counts, "params": r.params,
            "error": r.error, "started_at": r.started_at, "finished_at": r.finished_at}


@router.post("/run")
async def run_scan(body: ScanBody) -> dict:
    from app.worker.runner import submit_scan
    params = {k: v for k, v in body.model_dump().items() if v is not None}
    job_id, scan_run_id = submit_scan(params)
    return {"job_id": job_id, "scan_run_id": scan_run_id, "params": params}


@router.get("/runs")
async def list_runs(limit: int = 20, db: AsyncSession = Depends(get_db)) -> dict:
    rows = (await db.execute(select(ScanRun).order_by(desc(ScanRun.id)).limit(limit))).scalars().all()
    return {"runs": [_run(r) for r in rows]}


@router.get("/runs/{run_id}")
async def get_run(run_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    r = await db.get(ScanRun, run_id)
    return _run(r) if r else {"error": "not found"}


async def _results(db: AsyncSession, run_id: int, sort: str, sector: str | None,
                   min_score: float | None, limit: int, offset: int) -> dict:
    q = (select(ScanResult, Company)
         .join(Company, Company.id == ScanResult.company_id)
         .where(ScanResult.scan_run_id == run_id))
    if sector:
        q = q.where(Company.sector == sector)
    if min_score is not None:
        q = q.where(ScanResult.total_score >= min_score)
    q = q.order_by(ScanResult.rank.asc() if sort == "rank" else desc(ScanResult.total_score))
    total = await db.scalar(select(func.count()).select_from(q.subquery()))
    rows = (await db.execute(q.limit(limit).offset(offset))).all()
    items = [{
        "rank": sr.rank, "ticker": c.ticker, "name": c.name, "sector": c.sector,
        "total_score": float(sr.total_score) if sr.total_score is not None else None,
        "sub_scores": sr.sub_scores, "recommendation": sr.recommendation,
    } for sr, c in rows]
    return {"run_id": run_id, "total": total, "results": items}


@router.get("/results/{run_id}")
async def results(run_id: int, sort: str = "rank", sector: str | None = None,
                  min_score: float | None = None, limit: int = 100, offset: int = 0,
                  db: AsyncSession = Depends(get_db)) -> dict:
    return await _results(db, run_id, sort, sector, min_score, limit, offset)


@router.get("/latest")
async def latest(sort: str = "rank", sector: str | None = None, min_score: float | None = None,
                 limit: int = 100, offset: int = 0, db: AsyncSession = Depends(get_db)) -> dict:
    run_id = await db.scalar(select(ScanRun.id).where(ScanRun.status == "succeeded")
                             .order_by(desc(ScanRun.id)).limit(1))
    if not run_id:
        return {"run_id": None, "total": 0, "results": []}
    return await _results(db, run_id, sort, sector, min_score, limit, offset)
