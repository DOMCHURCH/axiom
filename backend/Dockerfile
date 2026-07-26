# Shared image for both the `api` and `worker` Railway services.
# The start command is overridden per service (uvicorn vs celery).
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# System deps: build tools for any source wheels, libgomp1 for onnxruntime (fastembed),
# curl for healthchecks.
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        curl \
        libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . .

EXPOSE 8080

# Listen on a fixed 8080 so the container port always matches the Railway
# domain's target port (avoids 502s from $PORT being empty or mismatched).
# The railway.json start command overrides this to also run the DB migration.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
