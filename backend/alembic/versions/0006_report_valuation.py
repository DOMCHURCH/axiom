"""ai_reports: valuation_analysis + price_target

The valuation engine (app.quant.valuation) computes a DCF / Monte Carlo in
Python; the model writes a narrative interpretation of it and may state a target
drawn only from the provided ranges. Persist both so a saved report can be
re-read with its valuation section intact.

Revision ID: 0006_report_valuation
Revises: 0005_appsettings
Create Date: 2026-07-26
"""
import sqlalchemy as sa
from alembic import op

revision = "0006_report_valuation"
down_revision = "0005_appsettings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Additive + idempotent: safe to re-run against a DB that already has them.
    op.execute("ALTER TABLE ai_reports ADD COLUMN IF NOT EXISTS valuation_analysis TEXT")
    op.execute("ALTER TABLE ai_reports ADD COLUMN IF NOT EXISTS price_target NUMERIC(18, 4)")


def downgrade() -> None:
    op.execute("ALTER TABLE ai_reports DROP COLUMN IF EXISTS price_target")
    op.execute("ALTER TABLE ai_reports DROP COLUMN IF EXISTS valuation_analysis")
