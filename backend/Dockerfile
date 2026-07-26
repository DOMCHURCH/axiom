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

EXPOSE 8000

# Default = api. Worker service overrides this with:
#   celery -A app.worker.celery_app worker --loglevel=info --concurrency=4
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
