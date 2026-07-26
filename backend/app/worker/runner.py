"""In-process background job runner (replaces Celery for the lean deploy).

Jobs run in a small thread pool inside the api process; progress is written to
the Postgres `jobs` table so the frontend can poll it exactly as before. The
public contract (submit -> job_id -> poll /jobs/{id}) is unchanged.
"""

from __future__ import annotations

import uuid
from concurrent.futures import ThreadPoolExecutor

from app.core.logging import get_logger
from app.services import jobs, report, scanner, trade_scanner, trade_thesis

log = get_logger("runner")

# 2 workers: a scan and a report can run concurrently without starving each other.
_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="job")


def submit_scan(params: dict | None = None) -> tuple[str, int]:
    job_id = uuid.uuid4().hex
    scan_run_id = jobs.create_scan_run(params or {})
    jobs.create_job(job_id, "scan", {"scan_run_id": scan_run_id})
    _executor.submit(_run_scan, job_id, scan_run_id, params)
    return job_id, scan_run_id


def _run_scan(job_id: str, scan_run_id: int, params: dict | None) -> None:
    try:
        scanner.run_scan(scan_run_id, job_id, params)
        jobs.finish_scan_run(scan_run_id, "succeeded")
    except Exception as exc:  # noqa: BLE001
        log.exception("scan failed")
        jobs.finish_scan_run(scan_run_id, "failed", str(exc))
        jobs.update_job(job_id, status="failed", error=str(exc))


def submit_report(company_id: int, reasoning_effort: str = "medium") -> str:
    job_id = uuid.uuid4().hex
    jobs.create_job(job_id, "report", {"company_id": company_id})
    jobs.update_job(job_id, status="running", stage="generating research report")
    _executor.submit(_run_report, job_id, company_id, reasoning_effort)
    return job_id


def _run_report(job_id: str, company_id: int, reasoning_effort: str) -> None:
    try:
        report_id = report.generate_and_store(company_id, reasoning_effort=reasoning_effort)
        jobs.update_job(job_id, status="succeeded", progress=100, stage="done",
                        result_ref={"report_id": report_id})
    except Exception as exc:  # noqa: BLE001
        log.exception("report failed")
        jobs.update_job(job_id, status="failed", error=str(exc))


# ---- trading workstation ----
def submit_trade_scan(params: dict | None = None) -> tuple[str, int]:
    job_id = uuid.uuid4().hex
    trade_run_id = jobs.create_trade_run(params or {}, (params or {}).get("capital"),
                                         (params or {}).get("horizon"))
    jobs.create_job(job_id, "trade_scan", {"trade_run_id": trade_run_id})
    _executor.submit(_run_trade_scan, job_id, trade_run_id, params)
    return job_id, trade_run_id


def _run_trade_scan(job_id: str, trade_run_id: int, params: dict | None) -> None:
    try:
        trade_scanner.run_trade_scan(trade_run_id, job_id, params)
        jobs.finish_trade_run(trade_run_id, "succeeded")
    except Exception as exc:  # noqa: BLE001
        log.exception("trade scan failed")
        jobs.finish_trade_run(trade_run_id, "failed", str(exc))
        jobs.update_job(job_id, status="failed", error=str(exc))


def submit_backtest() -> str:
    job_id = uuid.uuid4().hex
    jobs.create_job(job_id, "backtest", {})
    jobs.update_job(job_id, status="running", stage="backtesting strategies")
    _executor.submit(_run_backtest, job_id)
    return job_id


def _run_backtest(job_id: str) -> None:
    try:
        from app.services.backtest import run_and_store
        res = run_and_store()
        jobs.update_job(job_id, status="succeeded", progress=100, stage="done",
                        result_ref={"strategies": len(res.get("stats", {}))})
    except Exception as exc:  # noqa: BLE001
        log.exception("backtest failed")
        jobs.update_job(job_id, status="failed", error=str(exc))


def submit_trade_review(active_trade_id: int) -> str:
    job_id = uuid.uuid4().hex
    jobs.create_job(job_id, "trade_review", {"active_trade_id": active_trade_id})
    jobs.update_job(job_id, status="running", stage="reviewing open trade")
    _executor.submit(_run_trade_review, job_id, active_trade_id)
    return job_id


def _run_trade_review(job_id: str, active_trade_id: int) -> None:
    try:
        trade_thesis.review_active_trade(active_trade_id)
        jobs.update_job(job_id, status="succeeded", progress=100, stage="done",
                        result_ref={"active_trade_id": active_trade_id})
    except Exception as exc:  # noqa: BLE001
        log.exception("trade review failed")
        jobs.update_job(job_id, status="failed", error=str(exc))
