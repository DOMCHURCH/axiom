"""US equity universe from SEC's official ticker list (unlimited, no key).

Source: https://www.sec.gov/files/company_tickers.json
Gives ticker + CIK + name for every SEC-registered filer. This is the master
list the scanner iterates over. Sector/industry/market-cap are enriched later by
yfinance/FMP for names that survive the funnel.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.config import settings
from app.core.http import get_json
from app.core.logging import get_logger
from app.data.limits import sec_throttle
from app.db.models import Company

log = get_logger("universe")

SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"


def _sec_headers() -> dict:
    return {"User-Agent": settings.sec_user_agent, "Accept-Encoding": "gzip, deflate"}


def fetch_sec_tickers() -> list[dict]:
    """Return [{ticker, cik, name}, ...] for all SEC filers with a ticker."""
    sec_throttle.acquire()
    raw = get_json(SEC_TICKERS_URL, headers=_sec_headers())
    rows: list[dict] = []
    # raw is {"0": {"cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc."}, ...}
    for entry in raw.values():
        ticker = (entry.get("ticker") or "").strip().upper()
        if not ticker:
            continue
        # skip obvious non-common tickers (warrants/units/rights) — keep it simple
        if any(sfx in ticker for sfx in (".W", ".U", ".R", "-WT", "-U", "-RT")):
            continue
        rows.append({
            "ticker": ticker,
            "cik": str(entry.get("cik_str", "")).zfill(10),
            "name": entry.get("title"),
        })
    log.info("fetched SEC universe", extra={"count": len(rows)})
    return rows


def upsert_universe(session: Session, rows: list[dict] | None = None) -> int:
    """Insert/update companies from the SEC list. Idempotent."""
    rows = rows if rows is not None else fetch_sec_tickers()
    if not rows:
        return 0
    inserted = 0
    CHUNK = 1000
    for i in range(0, len(rows), CHUNK):
        chunk = rows[i:i + CHUNK]
        stmt = pg_insert(Company).values([
            {"ticker": r["ticker"], "cik": r["cik"], "name": r["name"], "is_active": True}
            for r in chunk
        ])
        stmt = stmt.on_conflict_do_update(
            index_elements=[Company.ticker],
            set_={"cik": stmt.excluded.cik, "name": stmt.excluded.name},
        )
        session.execute(stmt)
        inserted += len(chunk)
    session.commit()
    total = session.scalar(select(func.count()).select_from(Company))
    log.info("universe upserted", extra={"processed": inserted, "total_companies": total})
    return total or 0


def active_tickers(session: Session, limit: int | None = None) -> list[str]:
    stmt = select(Company.ticker).where(Company.is_active.is_(True)).order_by(Company.ticker)
    if limit:
        stmt = stmt.limit(limit)
    return list(session.scalars(stmt))
