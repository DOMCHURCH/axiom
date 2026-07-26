# AXIOM — single-service image: builds the React frontend and serves it from the
# FastAPI backend, so the whole app runs as ONE Railway service (+ Postgres).

# ---------- Stage 1: build the React frontend ----------
FROM node:20-slim AS frontend
WORKDIR /fe
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci || npm install
COPY frontend/ ./
RUN npm run build          # outputs /fe/dist

# ---------- Stage 2: Python backend that also serves the built frontend ----------
FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        curl \
        libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY backend/ .
# Bring the built frontend in as /app/static (FastAPI serves it at /).
COPY --from=frontend /fe/dist ./static

EXPOSE 8080

# Run DB migrations in the background so the web server binds the port immediately.
CMD ["sh", "-c", "alembic upgrade head & uvicorn app.main:app --host 0.0.0.0 --port 8080"]
