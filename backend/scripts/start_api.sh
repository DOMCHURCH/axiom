#!/usr/bin/env bash
# Backend service start command for Railway (lean 3-service deploy).
# Runs DB migrations (idempotent) then launches the ASGI server. Background scan/
# report jobs run in-process, so a SINGLE worker keeps in-memory rate limits and
# the job thread-pool authoritative. Heavy work happens off the event loop in
# threads, so one uvicorn worker comfortably serves a single-user terminal.
set -e

echo "[start_api] running migrations..."
alembic upgrade head

echo "[start_api] starting gunicorn (1 uvicorn worker) on :${PORT:-8000}"
exec gunicorn app.main:app \
  -k uvicorn.workers.UvicornWorker \
  -b "0.0.0.0:${PORT:-8000}" \
  --workers "${WEB_CONCURRENCY:-1}" \
  --timeout 120 \
  --access-logfile - \
  --error-logfile -
