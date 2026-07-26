"""Job + ScanRun progress tracking. Each update commits immediately so the API
can report live progress to the frontend's 'Find Best Stocks' UI.
"""

from __future__ import annotations

from datetime import datetime

from app.core.logging import get_logger
from app.db.models import Job, ScanRun, TradeRun
from app.db.session import session_scope

log = get_logger("jobs")


def create_job(job_id: str, type_: str, result_ref: dict | None = None) -> None:
    with session_scope() as s:
        s.merge(Job(id=job_id, type=type_, status="queued", progress=0, result_ref=result_ref))


def update_job(job_id: str, *, status: str | None = None, progress: int | None = None,
               stage: str | None = None, result_ref: dict | None = None,
               error: str | None = None) -> None:
    with session_scope() as s:
        job = s.get(Job, job_id)
        if job is None:
            job = Job(id=job_id, type="unknown")
            s.add(job)
        if status is not None:
            job.status = status
        if progress is not None:
            job.progress = max(0, min(100, int(progress)))
        if stage is not None:
            job.stage = stage
        if result_ref is not None:
            job.result_ref = {**(job.result_ref or {}), **result_ref}
        if error is not None:
            job.error = error


def create_scan_run(params: dict, universe_size: int | None = None) -> int:
    with session_scope() as s:
        run = ScanRun(status="running", params=params, universe_size=universe_size,
                      stage="starting", progress=0, started_at=datetime.utcnow(), counts={})
        s.add(run)
        s.flush()
        return run.id


def update_scan_run(scan_run_id: int, **fields) -> None:
    with session_scope() as s:
        run = s.get(ScanRun, scan_run_id)
        if run is None:
            return
        counts = fields.pop("counts_merge", None)
        for k, v in fields.items():
            setattr(run, k, v)
        if counts:
            run.counts = {**(run.counts or {}), **counts}


def finish_scan_run(scan_run_id: int, status: str, error: str | None = None) -> None:
    update_scan_run(scan_run_id, status=status, finished_at=datetime.utcnow(),
                    progress=100 if status == "succeeded" else None, error=error)


# ---- trade runs ----
def create_trade_run(params: dict, capital: float | None, horizon: str | None) -> int:
    with session_scope() as s:
        run = TradeRun(status="running", params=params, capital=capital, horizon=horizon,
                       stage="starting", progress=0, started_at=datetime.utcnow(), counts={})
        s.add(run)
        s.flush()
        return run.id


def update_trade_run(trade_run_id: int, **fields) -> None:
    with session_scope() as s:
        run = s.get(TradeRun, trade_run_id)
        if run is None:
            return
        counts = fields.pop("counts_merge", None)
        for k, v in fields.items():
            setattr(run, k, v)
        if counts:
            run.counts = {**(run.counts or {}), **counts}


def finish_trade_run(trade_run_id: int, status: str, error: str | None = None) -> None:
    update_trade_run(trade_run_id, status=status, finished_at=datetime.utcnow(),
                     progress=100 if status == "succeeded" else None, error=error)
