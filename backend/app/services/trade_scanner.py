"""'Find Best Trades' funnel — the trading-workstation scanner.

    liquid universe -> yahoo prices -> liquidity gate -> strategy signals +
    horizon-weighted trade score -> rank -> enrich top (sentiment + fundamentals)
    -> re-score -> setups -> capital allocation -> persist

Only the top handful of names touch the rate-limited/expensive APIs, and all DB
writes are batched into a few statements (fast even over Railway's public proxy).
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.config import settings
from app.core.cache import _key, cache_get, cache_set
from app.core.logging import get_logger
from app.data import gdelt, yahoo
from app.data.liquid_universe import LIQUID_TICKERS, TICKER_SECTOR

# Prices are daily bars; cache the bulk fetch in-memory for the session so
# re-running a scan the same day is near-instant (no repeat Yahoo download).
_PRICE_TTL = 4 * 3600


def _cached_bulk(tickers: list[str], period: str):
    key = _key("tprices", period, ",".join(tickers))
    hit = cache_get(key)
    if hit is not None:
        return hit
    frames = yahoo.fetch_prices_bulk(tickers, period=period)
    cache_set(key, frames, _PRICE_TTL)
    return frames


def _cached_ohlcv(ticker: str, period: str):
    key = _key("tohlcv", ticker, period)
    hit = cache_get(key)
    if hit is not None:
        return hit
    df = yahoo.fetch_ohlcv(ticker, period=period)
    cache_set(key, df, _PRICE_TTL)
    return df
from app.db.models import Company, StockPrice, TechnicalMetric, TradeRecommendation
from app.db.session import session_scope
from app.quant.allocation import allocate
from app.quant.strategies import compute_strategy_signals
from app.quant.technical import compute_technicals
from app.quant.trade_scoring import HORIZON_LABEL, compute_trade_scores
from app.quant.trade_setup import generate_setup
from app.services import jobs
from app.services.ingest import _clean, _to_date
from app.services.scanner import _fmp_bundle

log = get_logger("trade_scanner")


def _resolve(params: dict | None) -> dict:
    params = params or {}
    return {
        "capital": float(params.get("capital", 10_000)),
        "horizon": params.get("horizon", "1w"),
        "universe_limit": params.get("universe_limit"),
        "keep": int(params.get("keep", 15)),
        "num_positions": int(params.get("num_positions", 6)),
        # FMP fundamentals are low-weight for short-term trades and slow to fetch;
        # off by default (sentiment still runs). Pass enrich=true for a deeper scan.
        "enrich": params.get("enrich", False),
        "min_price": float(params.get("min_price", settings.universe_min_price)),
        "min_dollar_vol": float(params.get("min_dollar_vol", settings.universe_min_avg_dollar_volume)),
    }


def _gate(tech: dict, p: dict) -> bool:
    price = tech.get("last_price")
    if price is None or price < p["min_price"]:
        return False
    adv = (tech.get("extra") or {}).get("avg_dollar_volume")
    return adv is not None and adv >= p["min_dollar_vol"]


def _enrich_one(c: dict, horizon: str, do_fmp: bool) -> dict:
    """News sentiment (+ optional fundamentals) for one candidate, then re-score.
    Every external call is best-effort — failures degrade gracefully to None."""
    sentiment = None
    try:
        sentiment = gdelt.tone(c["name"] or c["ticker"])
    except Exception:
        pass
    fund = None
    if do_fmp:
        try:
            from app.quant.fundamental import compute_fundamentals
            bundle = _fmp_bundle(c["ticker"])
            if bundle and any(bundle.values()):
                fund = compute_fundamentals(bundle)
        except Exception:
            fund = None
    c["sentiment"] = sentiment
    c["fund"] = fund
    c["scores"] = compute_trade_scores(c["signals"], c["features"], c["tech"], fund, sentiment, horizon)
    return c


def run_trade_scan(trade_run_id: int, job_id: str, params: dict | None = None) -> dict:
    p = _resolve(params)
    horizon = p["horizon"]

    def progress(pct: int, stage: str):
        jobs.update_job(job_id, status="running", progress=pct, stage=stage)
        jobs.update_trade_run(trade_run_id, stage=stage, progress=pct)

    # ---- universe (liquid names that exist in our seeded company table) ----
    progress(4, "Loading liquid universe")
    tickers = LIQUID_TICKERS[: p["universe_limit"]] if p["universe_limit"] else LIQUID_TICKERS
    with session_scope() as s:
        cmap = {t: (cid, cik, name, sector) for cid, t, cik, name, sector in s.execute(
            select(Company.id, Company.ticker, Company.cik, Company.name, Company.sector)
            .where(Company.ticker.in_(tickers))).all()}
    tickers = [t for t in tickers if t in cmap]
    jobs.update_trade_run(trade_run_id, universe_size=len(tickers), counts_merge={"universe": len(tickers)})

    # ---- benchmark for relative strength ----
    bench = {}
    try:
        spy = compute_technicals(_cached_ohlcv("SPY", "1y")) or {}
        ex = spy.get("extra") or {}
        bench = {"return_1m": ex.get("return_1m"), "return_3m": ex.get("return_3m")}
    except Exception:
        pass

    # ---- prices (cached in-memory for the session) ----
    progress(14, f"Fetching prices for {len(tickers)} liquid names")
    frames = _cached_bulk(tickers, "1y")

    # ---- score every candidate ----
    progress(45, "Scoring trading setups")
    scored: list[dict] = []
    for t in tickers:
        df = frames.get(t)
        if df is None or df.empty:
            continue
        tech = compute_technicals(df)
        if not tech or not _gate(tech, p):
            continue
        res = compute_strategy_signals(df, tech, bench)
        sc = compute_trade_scores(res["signals"], res["features"], tech, None, None, horizon)
        if sc["overall_score"] is None:
            continue
        cid, cik, name, sector = cmap[t]
        scored.append({
            "ticker": t, "company_id": cid, "cik": cik, "name": name,
            "sector": TICKER_SECTOR.get(t) or sector,
            "df": df, "tech": tech, "features": res["features"], "signals": res["signals"],
            "scores": sc,
        })
    scored.sort(key=lambda x: x["scores"]["overall_score"], reverse=True)
    keep = scored[: p["keep"]]
    jobs.update_trade_run(trade_run_id, counts_merge={"priced": len(frames), "scored": len(scored)})

    # ---- enrich only the names that can actually be allocated (fast) ----
    # sentiment/fundamentals matter most for the trades we'll size; the rest keep
    # their price/technical score. Concurrent so a slow call can't stall the scan.
    enrich_top = min(len(keep), max(p["num_positions"], 8))
    progress(65, f"Enriching top {enrich_top} candidates")
    with ThreadPoolExecutor(max_workers=8) as ex:
        list(ex.map(lambda c: _enrich_one(c, horizon, p["enrich"]), keep[:enrich_top]))
    keep.sort(key=lambda x: x["scores"]["overall_score"], reverse=True)

    # ---- setups + allocation ----
    progress(85, "Building setups + allocating capital")
    for c in keep:
        c["setup"] = generate_setup(c["features"], horizon)

    alloc_cands = [{
        "ticker": c["ticker"], "confidence": c["scores"]["confidence"],
        "atr_pct": c["features"].get("atr_pct"), "sector": c["sector"],
        "price": c["tech"]["last_price"],
        "stop_pct": ((c["setup"] or {}).get("risk_per_share") / c["tech"]["last_price"])
        if (c.get("setup") and (c["setup"] or {}).get("risk_per_share") and c["tech"].get("last_price")) else None,
        "avg_dollar_volume": (c["tech"].get("extra") or {}).get("avg_dollar_volume"),
        "returns": c["df"]["adj_close"].pct_change().dropna().tolist()[-120:]
        if "adj_close" in c["df"] else None,
    } for c in keep]
    allocation = allocate(p["capital"], alloc_cands, max_positions=p["num_positions"])
    alloc_by_ticker = {pos["ticker"]: pos for pos in allocation["positions"]}

    # ---- persist (batched) ----
    progress(93, "Writing recommendations")
    _persist(trade_run_id, keep, alloc_by_ticker, horizon)

    counts = {"universe": len(tickers), "priced": len(frames), "scored": len(scored),
              "recommended": len(keep), "allocated": len(allocation["positions"])}
    jobs.update_trade_run(trade_run_id, counts_merge=counts, allocation=allocation,
                          capital=p["capital"], horizon=horizon)
    jobs.update_job(job_id, status="succeeded", progress=100, stage="done",
                    result_ref={"trade_run_id": trade_run_id, "count": len(keep)})
    log.info("trade scan complete", extra={"trade_run": trade_run_id, **counts})
    return {"trade_run_id": trade_run_id, **counts}


def scan_top(horizon: str = "1w", min_score: float = 82.0, min_conf: int = 72,
             limit: int = 25) -> list[dict]:
    """Lightweight in-memory scan for the 24/7 watcher — no DB writes, no paid APIs.

    Returns the strongest A+ setups (score/confidence gated) from the liquid
    universe using cached daily bars + the deterministic engine. The caller adds a
    live-price 'is it in the buy zone now' check before alerting.
    """
    p = _resolve({"horizon": horizon})
    tickers = LIQUID_TICKERS

    bench = {}
    try:
        spy = compute_technicals(_cached_ohlcv("SPY", "1y")) or {}
        ex = spy.get("extra") or {}
        bench = {"return_1m": ex.get("return_1m"), "return_3m": ex.get("return_3m")}
    except Exception:  # noqa: BLE001
        pass

    frames = _cached_bulk(tickers, "1y")
    out: list[dict] = []
    for t in tickers:
        df = frames.get(t)
        if df is None or df.empty:
            continue
        tech = compute_technicals(df)
        if not tech or not _gate(tech, p):
            continue
        res = compute_strategy_signals(df, tech, bench)
        sc = compute_trade_scores(res["signals"], res["features"], tech, None, None, horizon)
        s = sc.get("overall_score")
        if s is None or s < min_score or (sc.get("confidence") or 0) < min_conf:
            continue
        out.append({
            "ticker": t, "sector": TICKER_SECTOR.get(t),
            "current_price": tech.get("last_price"),
            "setup": generate_setup(res["features"], horizon),
            "scores": sc, "signals": res["signals"],
        })
    out.sort(key=lambda x: x["scores"]["overall_score"], reverse=True)
    return out[:limit]


def _persist(trade_run_id: int, keep: list[dict], alloc_by_ticker: dict, horizon: str) -> None:
    """One transaction, batched inserts — cheap even over the public DB proxy."""
    today = date.today()
    price_rows, tech_rows, rec_rows = [], [], []

    for rank, c in enumerate(keep, start=1):
        cid = c["company_id"]
        df, tech, sc, setup = c["df"], c["tech"], c["scores"], c["setup"]

        for ts, r in df.iterrows():
            d = _to_date(ts)
            if d is None:
                continue
            price_rows.append({
                "company_id": cid, "ts": d, "open": _clean(r.get("open")),
                "high": _clean(r.get("high")), "low": _clean(r.get("low")),
                "close": _clean(r.get("close")), "adj_close": _clean(r.get("adj_close")),
                "volume": _clean(r.get("volume")),
            })

        extra = {**(tech.get("extra") or {}), "last_price": tech.get("last_price")}
        tech_rows.append({
            "company_id": cid, "as_of": today, "extra": extra,
            **{k: _clean(tech.get(k)) for k in (
                "rsi", "macd", "macd_signal", "macd_hist", "sma_20", "sma_50", "sma_200",
                "ema_12", "ema_26", "bb_upper", "bb_mid", "bb_lower", "atr", "volatility",
                "momentum", "drawdown", "trend_score")},
        })

        rec_rows.append({
            "trade_run_id": trade_run_id, "company_id": cid, "ticker": c["ticker"],
            "rank": rank, "horizon": horizon, "strategy": sc["best_strategy"],
            "strategy_label": sc["best_strategy_label"], "overall_score": sc["overall_score"],
            "confidence": sc["confidence"], "current_price": _clean(tech.get("last_price")),
            "risk_level": (setup or {}).get("risk_level"),
            "expected_rr": (setup or {}).get("risk_reward_1"),
            "sub_scores": sc["sub_scores"], "strategy_signals": sc["strategy_signals"],
            "setup": setup, "allocation": alloc_by_ticker.get(c["ticker"]), "ai_thesis": None,
        })

    with session_scope() as s:
        if price_rows:
            st = pg_insert(StockPrice).values(price_rows)
            st = st.on_conflict_do_update(constraint="uq_price_company_ts",
                set_={k: st.excluded[k] for k in ("open", "high", "low", "close", "adj_close", "volume")})
            s.execute(st)
        if tech_rows:
            st = pg_insert(TechnicalMetric).values(tech_rows)
            st = st.on_conflict_do_update(constraint="uq_tech_company_asof",
                set_={k: st.excluded[k] for k in tech_rows[0] if k not in ("company_id", "as_of")})
            s.execute(st)
        if rec_rows:
            st = pg_insert(TradeRecommendation).values(rec_rows)
            st = st.on_conflict_do_update(constraint="uq_traderec_run_company",
                set_={k: st.excluded[k] for k in rec_rows[0] if k not in ("trade_run_id", "company_id")})
            s.execute(st)
