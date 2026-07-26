"""trade alerts table

Adds trade_alerts (email alert scheduling). Uses metadata.create_all(checkfirst)
so only the new table is created; existing tables are untouched.

Revision ID: 0003_alerts
Revises: 0002_trading
Create Date: 2026-07-23
"""
from alembic import op

from app.db.base import Base
from app.db import models  # noqa: F401  registers tables

revision = "0003_alerts"
down_revision = "0002_trading"
branch_labels = None
depends_on = None


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS trade_alerts CASCADE")
