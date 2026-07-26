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
    bind = op.get_bind()
    # pgvector must exist before any VECTOR column is created.
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    Base.metadata.create_all(bind=bind)
    # Approximate-nearest-neighbour index for filing chunk retrieval.
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_filing_chunks_embedding_hnsw "
        "ON filing_chunks USING hnsw (embedding vector_cosine_ops)"
    )


def downgrade() -> None:
    bind = op.get_bind()
    op.execute("DROP INDEX IF EXISTS ix_filing_chunks_embedding_hnsw")
    Base.metadata.drop_all(bind=bind)
