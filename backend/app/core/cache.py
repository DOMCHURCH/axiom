"""In-process TTL cache (no Redis).

Provider clients wrap calls in this to avoid re-hitting APIs. Since the lean
deploy runs a single process (api + background job threads share memory), an
in-memory dict with expiry is sufficient. Thread-safe.
"""

from __future__ import annotations

import functools
import hashlib
import threading
import time
from collections.abc import Callable

from app.core.logging import get_logger

log = get_logger("cache")

_store: dict[str, tuple[float, object]] = {}   # key -> (expires_at, value)
_lock = threading.Lock()
_MAX_ENTRIES = 5000


def _key(prefix: str, *parts) -> str:
    raw = ":".join(str(p) for p in parts)
    if len(raw) > 200:
        raw = hashlib.sha1(raw.encode()).hexdigest()
    return f"cache:{prefix}:{raw}"


def cache_get(key: str):
    now = time.time()
    with _lock:
        item = _store.get(key)
        if not item:
            return None
        expires_at, value = item
        if expires_at < now:
            _store.pop(key, None)
            return None
        return value


def cache_set(key: str, value, ttl: int) -> None:
    with _lock:
        if len(_store) >= _MAX_ENTRIES:
            # evict the ~10% soonest-to-expire entries
            victims = sorted(_store, key=lambda k: _store[k][0])[: _MAX_ENTRIES // 10]
            for k in victims:
                _store.pop(k, None)
        _store[key] = (time.time() + ttl, value)


def cached(prefix: str, ttl: int) -> Callable:
    """Cache a sync function returning JSON-serializable data."""

    def decorator(fn: Callable) -> Callable:
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            parts = list(args) + [f"{k}={kwargs[k]}" for k in sorted(kwargs)]
            key = _key(prefix, *parts)
            hit = cache_get(key)
            if hit is not None:
                return hit
            result = fn(*args, **kwargs)
            if result is not None:
                cache_set(key, result, ttl)
            return result

        return wrapper

    return decorator
