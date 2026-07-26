"""trading workstation tables

Adds trade_runs, trade_recommendations, active_trades. Uses metadata.create_all
(checkfirst) so only the new tables are created; existing tables are untouched.

Revision ID: 0002_trading
Revises: 0001_init
Create Date: 2026-07-23
"""
from alembic import op

from app.db.base import Base
from app.db import models  # noqa: F401  registers tables

revision = "0002_trading"
down_revision = "0001_init"
branch_labels = None
depends_on = None


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    bind = op.get_bind()
    for table in ("trade_recommendations", "active_trades", "trade_runs"):
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")
