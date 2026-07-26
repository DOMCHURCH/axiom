"""FastAPI application entrypoint (the `api` service)."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api.router import api_router
from app.config import settings
from app.core.logging import configure_logging, get_logger

log = get_logger("api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    log.info("api starting", extra={"env": settings.env, "version": __version__})
    try:
        from app.worker.alert_scheduler import start_scheduler
        start_scheduler()
    except Exception as exc:  # noqa: BLE001 — never block boot on the scheduler
        log.warning("alert scheduler failed to start", extra={"err": str(exc)})
    try:
        from app.worker.market_watch import start_market_watch
        start_market_watch()
    except Exception as exc:  # noqa: BLE001 — never block boot on the watcher
        log.warning("market watch failed to start", extra={"err": str(exc)})
    yield
    log.info("api stopping")


app = FastAPI(
    title=f"{settings.app_name} API",
    version=__version__,
    lifespan=lifespan,
)

# AXIOM has no cookie auth, so a wildcard origin is safe. Set FRONTEND_ORIGIN to a
# comma-separated allowlist to lock it down (credentials are then enabled).
_origins = [o.strip() for o in settings.frontend_origin.split(",") if o.strip()]
_allow_all = "*" in _origins or not _origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _allow_all else _origins + ["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=not _allow_all,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.api_v1_prefix)


@app.get("/")
async def root() -> dict:
    return {"name": settings.app_name, "version": __version__, "docs": "/docs"}
