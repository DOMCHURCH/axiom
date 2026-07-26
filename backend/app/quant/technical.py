"""Technical indicators computed with pandas/numpy (no TA-Lib native dependency).

Input: a price DataFrame with columns [open, high, low, close, adj_close, volume]
indexed by ascending date (as produced by app.data.yahoo). Output: a flat dict of
the latest indicator values plus an `extra` dict of derived stats. Every value is
`None` when there isn't enough history to compute it — never a fabricated number.
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd

TRADING_DAYS = 252


def _f(x) -> float | None:
    """Coerce to a clean float or None (drops NaN/inf)."""
    if x is None:
        return None
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def _price(df: pd.DataFrame) -> pd.Series:
    col = "adj_close" if "adj_close" in df and df["adj_close"].notna().any() else "close"
    return df[col].astype(float).dropna()


def rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    avg_loss = loss.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def macd(series: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9):
    ema_fast = series.ewm(span=fast, adjust=False).mean()
    ema_slow = series.ewm(span=slow, adjust=False).mean()
    line = ema_fast - ema_slow
    sig = line.ewm(span=signal, adjust=False).mean()
    return line, sig, line - sig


def bollinger(series: pd.Series, period: int = 20, std: float = 2.0):
    mid = series.rolling(period).mean()
    sd = series.rolling(period).std()
    return mid + std * sd, mid, mid - std * sd


def atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    high, low, close = df["high"], df["low"], df["close"]
    prev = close.shift(1)
    tr = pd.concat([(high - low).abs(), (high - prev).abs(), (low - prev).abs()], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()


def _return_over(series: pd.Series, lookback: int) -> float | None:
    if len(series) <= lookback:
        return None
    past, now = series.iloc[-lookback - 1], series.iloc[-1]
    if past in (0, None) or pd.isna(past):
        return None
    return _f(now / past - 1.0)


def compute_technicals(df: pd.DataFrame) -> dict | None:
    """Return the latest technical snapshot, or None if there's too little data."""
    if df is None or df.empty or len(df) < 30:
        return None
    df = df.sort_index()
    price = _price(df)
    if price.empty:
        return None

    close = price
    rsi_v = rsi(close)
    macd_line, macd_sig, macd_hist = macd(close)
    bb_u, bb_m, bb_l = bollinger(close)
    atr_series = atr(df)

    sma20 = close.rolling(20).mean()
    sma50 = close.rolling(50).mean()
    sma200 = close.rolling(200).mean()
    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()

    returns = close.pct_change().dropna()
    window = returns.iloc[-TRADING_DAYS:] if len(returns) > TRADING_DAYS else returns
    volatility = _f(window.std() * math.sqrt(TRADING_DAYS)) if len(window) > 5 else None

    last = _f(close.iloc[-1])
    cummax = close.cummax()
    drawdown = _f(close.iloc[-1] / cummax.iloc[-1] - 1.0)

    hi_52 = _f(close.iloc[-TRADING_DAYS:].max())
    lo_52 = _f(close.iloc[-TRADING_DAYS:].min())

    # momentum = blended 3/6/12-month total return
    mom_parts = [r for r in (_return_over(close, 63), _return_over(close, 126),
                             _return_over(close, TRADING_DAYS)) if r is not None]
    momentum = _f(sum(mom_parts) / len(mom_parts)) if mom_parts else None

    atr_last = _f(atr_series.iloc[-1])
    dollar_vol = None
    if "volume" in df:
        dv = (close * df["volume"]).iloc[-20:]
        dollar_vol = _f(dv.mean())

    s50, s200 = _f(sma50.iloc[-1]), _f(sma200.iloc[-1])
    trend = _trend_score(last, _f(sma20.iloc[-1]), s50, s200, sma50, momentum, _f(rsi_v.iloc[-1]))

    return {
        "last_price": last,
        "rsi": _f(rsi_v.iloc[-1]),
        "macd": _f(macd_line.iloc[-1]),
        "macd_signal": _f(macd_sig.iloc[-1]),
        "macd_hist": _f(macd_hist.iloc[-1]),
        "sma_20": _f(sma20.iloc[-1]),
        "sma_50": s50,
        "sma_200": s200,
        "ema_12": _f(ema12.iloc[-1]),
        "ema_26": _f(ema26.iloc[-1]),
        "bb_upper": _f(bb_u.iloc[-1]),
        "bb_mid": _f(bb_m.iloc[-1]),
        "bb_lower": _f(bb_l.iloc[-1]),
        "atr": _f(atr_last / last) if (atr_last and last) else None,  # ATR as % of price
        "volatility": volatility,
        "momentum": momentum,
        "drawdown": drawdown,
        "trend_score": trend,
        "extra": {
            "avg_dollar_volume": dollar_vol,
            "high_52w": hi_52,
            "low_52w": lo_52,
            "pct_from_52w_high": _f(last / hi_52 - 1.0) if (hi_52 and last) else None,
            "return_1m": _return_over(close, 21),
            "return_3m": _return_over(close, 63),
            "return_6m": _return_over(close, 126),
            "return_12m": _return_over(close, TRADING_DAYS),
            "above_sma50": bool(last and s50 and last > s50) if (last and s50) else None,
            "above_sma200": bool(last and s200 and last > s200) if (last and s200) else None,
            "bars": int(len(df)),
        },
    }


def _trend_score(last, sma20, sma50, sma200, sma50_series, momentum, rsi_v) -> float | None:
    """0-100 trend strength from MA stacking, slope, momentum, and RSI regime."""
    if last is None:
        return None
    score = 0.0
    if sma20 and last > sma20:
        score += 15
    if sma50 and last > sma50:
        score += 20
    if sma200 and last > sma200:
        score += 20
    if sma50 and sma200 and sma50 > sma200:  # golden-cross regime
        score += 15
    # slope of the 50-day average over the last ~20 sessions
    try:
        recent = sma50_series.dropna()
        if len(recent) > 21 and recent.iloc[-22] and recent.iloc[-1] > recent.iloc[-22]:
            score += 15
    except Exception:
        pass
    if momentum is not None:
        score += 10 if momentum > 0 else 0
    if rsi_v is not None and 45 <= rsi_v <= 72:  # healthy, not overbought
        score += 5
    return round(min(100.0, score), 2)
