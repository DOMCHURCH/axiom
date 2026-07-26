"""Strategy backtest — validate the 14 strategies against history, learn weights.

For each ticker in the liquid universe we walk history, and every time a strategy
fires strongly we record the forward return over the trade horizon. Aggregating
per strategy gives a real win-rate / average-return edge, which we turn into a
per-strategy weight multiplier that the live scorer applies — up-weighting the
strategies that actually worked and fading the ones that didn't.

**Out-of-sample validation (the important part).** We split each ticker's history
into an earlier TRAIN window (~70%) and a held-out later TEST window (~30%), with an
embargo gap so a train sample's forward return can't leak into the test window. The
weight tilt is *learned on TRAIN* but only kept in proportion to how much of that edge
*survived on TEST*. A strategy whose edge doesn't hold up out-of-sample is pulled back
to a neutral 1.0 — so pure in-sample curve-fitting never reaches the live scorer.

Runs as a background job (a couple of minutes on free Yahoo data). Results are
persisted to app_settings so the scorer and the UI can read them.
"""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone

from app.core.logging import get_logger

log = get_logger("backtest")

MIN_SAMPLES = 15          # strategies with fewer signals than this are ignored
DEFAULT_HORIZON = 5       # trading days of forward return (≈ 1 week)
SAMPLE_EVERY = 7          # sample every Nth day to keep it fast
THRESHOLD = 65            # a strategy "fires" at/above this signal
TRAIN_FRACTION = 0.70     # earlier 70% of each series trains; later 30% is held out


def _accumulate(df, horizon_days: int, sample_every: int, threshold: int,
                i_start: int, i_end: int, agg: dict) -> None:
    """Record per-strategy (n, wins, sum_ret) for samples with index in [i_start, i_end)."""
    from app.quant.strategies import compute_strategy_signals
    from app.quant.technical import compute_technicals

    closes = df["close"].to_numpy()
    n = len(df)
    lo = max(60, i_start)
    hi = min(n - horizon_days, i_end)
    for i in range(lo, hi, sample_every):
        entry, future = closes[i], closes[i + horizon_days]
        if not entry or not future or entry <= 0:
            continue
        sub = df.iloc[: i + 1]
        tech = compute_technicals(sub)
        if not tech:
            continue
        res = compute_strategy_signals(sub, tech, {})
        ret = float(future) / float(entry) - 1.0
        for k, v in (res.get("signals") or {}).items():
            if v is not None and v >= threshold:
                a = agg[k]
                a["n"] += 1
                a["wins"] += 1 if ret > 0 else 0
                a["sum_ret"] += ret


def _stats(agg: dict) -> dict:
    out = {}
    for k, a in agg.items():
        if a["n"] < MIN_SAMPLES:
            continue
        out[k] = {"samples": a["n"], "win_rate": round(a["wins"] / a["n"], 3),
                  "avg_return": round(a["sum_ret"] / a["n"], 4)}
    return out


def run_backtest(period: str = "1y", horizon_days: int = DEFAULT_HORIZON,
                 sample_every: int = SAMPLE_EVERY, threshold: int = THRESHOLD) -> dict:
    from app.data.liquid_universe import LIQUID_TICKERS
    from app.services.trade_scanner import _cached_bulk

    frames = _cached_bulk(LIQUID_TICKERS, period)
    train_agg: dict[str, dict] = defaultdict(lambda: {"n": 0, "wins": 0, "sum_ret": 0.0})
    test_agg: dict[str, dict] = defaultdict(lambda: {"n": 0, "wins": 0, "sum_ret": 0.0})
    scanned = 0

    for _t, df in frames.items():
        # need enough bars for a train window, an embargo, and a test window
        if df is None or df.empty or len(df) < 160 or "close" not in df:
            continue
        n = len(df)
        split = int(n * TRAIN_FRACTION)
        # TRAIN ends one horizon early (embargo) so its forward returns can't peek
        # into the TEST window; TEST is the held-out tail the weights never trained on.
        _accumulate(df, horizon_days, sample_every, threshold, 60, split - horizon_days, train_agg)
        _accumulate(df, horizon_days, sample_every, threshold, split, n, test_agg)
        scanned += 1

    train_stats = _stats(train_agg)
    test_stats = _stats(test_agg)

    # Learn each strategy's tilt from its TRAIN edge relative to peers, then keep the tilt
    # only if the SAME relative ranking persists out-of-sample (TEST). A tilt whose direction
    # flips — or that has no TEST data — collapses back to a neutral 1.0. This is what stops
    # in-sample curve-fitting (up- OR down-weights) from reaching the live scorer.
    weights: dict[str, float] = {}
    oos: dict[str, dict] = {}
    if train_stats:
        train_mean = sum(v["avg_return"] for v in train_stats.values()) / len(train_stats)
        test_mean = (sum(v["avg_return"] for v in test_stats.values()) / len(test_stats)
                     if test_stats else 0.0)
        for k, v in train_stats.items():
            train_rel = v["avg_return"] - train_mean            # edge vs peers, in-sample
            raw_w = max(0.7, min(1.3, 1.0 + train_rel * 12.0))  # +1% edge vs peers ≈ +0.12
            t = test_stats.get(k)
            test_rel = (t["avg_return"] - test_mean) if t else None
            if test_rel is None or train_rel == 0 or (train_rel >= 0) != (test_rel >= 0):
                keep = 0.0                                       # no OOS data or direction flipped
            else:
                keep = min(1.0, abs(test_rel) / abs(train_rel))  # fraction of edge that persisted
            weights[k] = round(1.0 + (raw_w - 1.0) * keep, 3)
            oos[k] = {
                "train_avg_return": v["avg_return"],
                "test_avg_return": t["avg_return"] if t else None,
                "in_sample_weight": round(raw_w, 3),
                "applied_weight": weights[k],
                "held_up": keep > 0,
            }

    survived = sum(1 for o in oos.values() if o["held_up"])
    return {
        "stats": dict(sorted(train_stats.items(), key=lambda kv: -kv[1]["avg_return"])),
        "test_stats": test_stats,
        "oos": oos,
        "weights": weights,
        "validation": {
            "train_fraction": TRAIN_FRACTION,
            "strategies_learned": len(train_stats),
            "survived_out_of_sample": survived,
            "note": ("Weights are trained on the earlier 70% of history and only kept in "
                     "proportion to the edge that survived on the held-out later 30%. "
                     f"{survived}/{len(train_stats)} strategies held up out-of-sample."),
        },
        "params": {"period": period, "horizon_days": horizon_days,
                   "sample_every": sample_every, "threshold": threshold},
        "tickers_scanned": scanned,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def run_and_store() -> dict:
    from app.services import app_settings
    result = run_backtest()
    app_settings.set("strategy_weights", json.dumps(result["weights"]))
    app_settings.set("backtest_result", json.dumps(result))
    v = result.get("validation", {})
    log.info("backtest complete", extra={"strategies": len(result["stats"]),
                                         "survived_oos": v.get("survived_out_of_sample")})
    return result


def latest() -> dict | None:
    from app.services import app_settings
    raw = app_settings.get("backtest_result")
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:  # noqa: BLE001
        return None
