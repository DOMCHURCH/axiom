"""Local text embeddings via fastembed (ONNX, no torch). Feeds pgvector.

Model default: BAAI/bge-small-en-v1.5 (384-dim), matching settings.embedding_dim.
The model is loaded lazily once per process and cached.
"""

from __future__ import annotations

from functools import lru_cache

from app.config import settings
from app.core.logging import get_logger

log = get_logger("embeddings")


@lru_cache(maxsize=1)
def _model():
    from fastembed import TextEmbedding  # imported lazily; heavy dependency

    log.info("loading embedding model", extra={"model": settings.embedding_model})
    return TextEmbedding(model_name=settings.embedding_model)


def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    return [list(map(float, vec)) for vec in _model().embed(texts)]


def embed_text(text: str) -> list[float]:
    return embed_texts([text])[0]
