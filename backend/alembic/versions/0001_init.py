"""initial schema + pgvector

Enables the pgvector extension, then builds the full schema from the SQLAlchemy
model metadata (guaranteeing the DB matches the models exactly), and adds the
HNSW cosine index used for filing similarity search. Subsequent migrations are
generated normally with `alembic revision --autogenerate`.

Revision ID: 0001_init
Revises:
Create Date: 2026-07-22
"""
from alembic import op

from app.db.base import Base
from app.db import models  # noqa: F401  registers tables

revision = "0001_init"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    from sqlalchemy import text

    bind = op.get_bind()

    # pgvector powers OPTIONAL SEC-filing similarity search. It is NOT needed for
    # the core scanner, scoring, or AI research notes (filing search degrades
    # gracefully). Only enable the vector table/index when the extension is
    # actually available, so a stock Postgres (no pgvector) still boots cleanly.
    has_vector = bool(bind.execute(text(
        "SELECT 1 FROM pg_available_extensions WHERE name = 'vector'"
    )).scalar())

    if has_vector:
        op.execute("CREATE EXTENSION IF NOT EXISTS vector")
        Base.metadata.create_all(bind=bind)
        # Approximate-nearest-neighbour index for filing chunk retrieval.
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_filing_chunks_embedding_hnsw "
            "ON filing_chunks USING hnsw (embedding vector_cosine_ops)"
        )
    else:
        # Build every table EXCEPT the vector-typed one (filing_chunks). Nothing
        # references it, so the rest of the schema is unaffected.
        tables = [t for t in Base.metadata.sorted_tables if t.name != "filing_chunks"]
        Base.metadata.create_all(bind=bind, tables=tables)


def downgrade() -> None:
    bind = op.get_bind()
    op.execute("DROP INDEX IF EXISTS ix_filing_chunks_embedding_hnsw")
    Base.metadata.drop_all(bind=bind)
