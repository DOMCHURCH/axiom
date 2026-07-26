"""positions ledger + alert linkage

Adds the `positions` table (create_all) and a `position_id` column on
`trade_alerts` linking sell alerts to a real logged position.

Revision ID: 0004_positions
Revises: 0003_alerts
Create Date: 2026-07-23
"""
from alembic import op

from app.db.base import Base
from app.db import models  # noqa: F401  registers tables

revision = "0004_positions"
down_revision = "0003_alerts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind())          # creates `positions`
    op.execute("ALTER TABLE trade_alerts ADD COLUMN IF NOT EXISTS position_id INTEGER")
    op.execute("CREATE INDEX IF NOT EXISTS ix_trade_alerts_position_id ON trade_alerts (position_id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_trade_alerts_position_id")
    op.execute("ALTER TABLE trade_alerts DROP COLUMN IF EXISTS position_id")
    op.execute("DROP TABLE IF EXISTS positions CASCADE")
