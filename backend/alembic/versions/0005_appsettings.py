"""app_settings key/value store

Adds the `app_settings` table (create_all) for runtime toggles like the
in-app automation switch.

Revision ID: 0005_appsettings
Revises: 0004_positions
Create Date: 2026-07-24
"""
from alembic import op

from app.db.base import Base
from app.db import models  # noqa: F401  registers tables

revision = "0005_appsettings"
down_revision = "0004_positions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS app_settings CASCADE")
