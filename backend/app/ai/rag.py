"""Retrieval-augmented context over SEC filings, stored in pgvector.

index_filing()  -> chunk + embed a filing's text into filing_chunks
search_filings() -> nearest chunks to a query for a given company (cosine)
"""

from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.ai.embeddings import embed_text, embed_texts
from app.core.logging import get_logger
from app.db.models import FilingChunk, SecFiling

log = get_logger("rag")


def chunk_text(text: str, size: int = 1200, overlap: int = 150) -> list[str]:
    """Character-window chunks with overlap, snapped to word boundaries."""
    text = " ".join((text or "").split())
    if not text:
        return []
    chunks: list[str] = []
    start = 0
    n = len(text)
    while start < n:
        end = min(start + size, n)
        if end < n:  # don't cut mid-word
            sp = text.rfind(" ", start, end)
            if sp > start:
                end = sp
        chunks.append(text[start:end].strip())
        if end >= n:
            break
        start = max(end - overlap, start + 1)
    return [c for c in chunks if c]


def index_filing(session: Session, filing: SecFiling, max_chunks: int = 120) -> int:
    """Embed a filing into filing_chunks (idempotent — replaces existing chunks)."""
    if not filing.filing_content:
        return 0
    chunks = chunk_text(filing.filing_content)[:max_chunks]
    if not chunks:
        return 0

    session.execute(delete(FilingChunk).where(FilingChunk.filing_id == filing.id))
    vectors = embed_texts(chunks)
    session.add_all([
        FilingChunk(filing_id=filing.id, company_id=filing.company_id,
                    chunk_index=i, content=c, embedding=v)
        for i, (c, v) in enumerate(zip(chunks, vectors))
    ])
    filing.embedded = True
    session.flush()
    log.info("indexed filing", extra={"filing_id": filing.id, "chunks": len(chunks)})
    return len(chunks)


def search_filings(session: Session, company_id: int, query: str, k: int = 5) -> list[dict]:
    """Return the k most relevant filing chunks for a company."""
    qvec = embed_text(query)
    stmt = (
        select(FilingChunk.content, FilingChunk.filing_id,
               FilingChunk.embedding.cosine_distance(qvec).label("dist"))
        .where(FilingChunk.company_id == company_id)
        .order_by("dist")
        .limit(k)
    )
    rows = session.execute(stmt).all()
    return [{"content": r.content, "filing_id": r.filing_id, "distance": float(r.dist)} for r in rows]
