"""Fetch SEC filings, store them, and index text into pgvector for RAG."""

from __future__ import annotations

from datetime import date, datetime

from dateutil import parser as dateparser
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai import rag
from app.core.logging import get_logger
from app.data import sec
from app.db.models import Company, SecFiling

log = get_logger("filings")


def _d(v) -> date | None:
    if not v:
        return None
    try:
        return dateparser.parse(str(v)).date()
    except (ValueError, TypeError):
        return None


def upsert_filing_meta(session: Session, company_id: int, meta: dict) -> SecFiling:
    filing = session.scalar(
        select(SecFiling).where(SecFiling.accession_no == meta["accession_no"]))
    if filing is None:
        filing = SecFiling(company_id=company_id, accession_no=meta["accession_no"])
        session.add(filing)
    filing.filing_type = meta.get("filing_type")
    filing.filing_date = _d(meta.get("filing_date"))
    filing.period_of_report = _d(meta.get("period_of_report"))
    filing.url = meta.get("url")
    session.flush()
    return filing


def ensure_indexed(session: Session, company: Company,
                   forms=("10-K", "10-Q"), max_docs: int = 2) -> int:
    """Store recent filing metadata; fetch + embed text for the latest few docs."""
    if not company.cik:
        return 0
    metas = sec.recent_filings(company.cik, forms=forms, limit=6)
    for m in metas:
        upsert_filing_meta(session, company.id, m)

    to_index = (session.execute(
        select(SecFiling)
        .where(SecFiling.company_id == company.id, SecFiling.embedded.is_(False),
               SecFiling.url.is_not(None))
        .order_by(SecFiling.filing_date.desc())
        .limit(max_docs)
    ).scalars().all())

    indexed = 0
    for filing in to_index:
        text = sec.fetch_filing_text(filing.url)
        if not text:
            continue
        filing.filing_content = text
        session.flush()
        indexed += rag.index_filing(session, filing)
    log.info("filings ensured", extra={"company_id": company.id, "indexed_chunks": indexed})
    return indexed
