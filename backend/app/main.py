"""FastAPI application entrypoint.

Serves the JSON API under /api/v1 AND (when a built frontend is present at
../static) the React single-page app on every other path — so the whole product
runs as ONE service on one domain.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app import __version__
from app.api.router import api_router
from app.config import settings
from app.core.logging import configure_logging, get_logger

log = get_logger("api")

# The Dockerfile copies the built Vite frontend (frontend/dist) to /app/static.
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


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


@app.get("/healthz")
async def healthz() -> dict:
    return {"name": settings.app_name, "version": __version__, "docs": "/docs"}


@app.get("/version")
async def version() -> dict:
    """Dead-simple build probe: no DB, no router, no auth.

    If this returns JSON you are talking to the AXIOM backend. If it returns the
    HTML page instead, you are hitting a static frontend-only service and the API
    lives somewhere else — which is the usual reason the app looks alive but
    nothing loads.
    """
    return {
        "name": settings.app_name,
        "version": __version__,
        "commit": settings.git_sha[:7] if settings.git_sha else None,
        "branch": settings.git_branch or None,
        "serves_frontend": STATIC_DIR.is_dir(),
    }


# Serve the built React SPA for every non-API path (assets served directly,
# client-side routes fall back to index.html). Registered LAST so it never
# shadows the API. If no build is present (pure-API dev), this is skipped.
if STATIC_DIR.is_dir():
    @app.get("/{full_path:path}")
    async def spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        candidate = STATIC_DIR / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(STATIC_DIR / "index.html")
else:
    @app.get("/")
    async def root() -> dict:
        return {"name": settings.app_name, "version": __version__, "docs": "/docs"}
