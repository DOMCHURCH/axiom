"""Learned per-strategy weight multipliers from the backtest (cached).

The live scorer multiplies each raw strategy signal by its weight so proven
strategies count more and weak ones count less. Defaults to {} (no change) until
a backtest has been run. Cached in-memory for 5 min to avoid a DB hit per score.
"""

from __future__ import annotations

import json
import time

_cache: dict = {"w": {}, "ts": 0.0, "loaded": False}


def load_weights() -> dict:
    now = time.time()
    # cache for 5 min — including an empty result (the common no-backtest case),
    # so a hot scan loop never re-hits the DB per score.
    if _cache["loaded"] and now - _cache["ts"] < 300:
        return _cache["w"]
    from app.services import app_settings
    w = {}
    raw = app_settings.get("strategy_weights")
    if raw:
        try:
            w = json.loads(raw) or {}
        except Exception:  # noqa: BLE001
            w = {}
    _cache["w"] = w
    _cache["ts"] = now
    _cache["loaded"] = True
    return w
