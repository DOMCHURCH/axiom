"""Aggregate API router mounted under settings.api_v1_prefix.

Feature routers (companies, scanner, market, portfolio, jobs, reports) are added
in their respective phases; health + auth exist from the foundation.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.routes import (
    ai, alerts, auth, automation, backtest, companies, dashboard, economic, health, jobs,
    portfolio, positions, scanner, trades,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(dashboard.router)
api_router.include_router(scanner.router)
api_router.include_router(companies.router)
api_router.include_router(portfolio.router)
api_router.include_router(jobs.router)
api_router.include_router(trades.router)
api_router.include_router(trades.active_router)
api_router.include_router(economic.router)
api_router.include_router(alerts.router)
api_router.include_router(ai.router)
api_router.include_router(positions.router)
api_router.include_router(automation.router)
api_router.include_router(backtest.router)
