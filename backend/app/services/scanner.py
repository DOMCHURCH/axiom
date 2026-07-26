"""The staged scanner funnel — the engine behind 'Find Best Stocks'.

    universe -> bulk yahoo prices -> liquidity/technical gate -> technical rank
    -> staged FMP/SEC fundamental enrichment (budget-aware) -> composite score
    -> rank -> top-N

Cheap, unlimited yahoo data filters the whole universe; only the strongest
technical candidates ever consume the rate-limited fundamental APIs, in rank
order, until the daily FMP budget is spent (survivors then fall back to free SEC
Company Facts or cached data). Nothing refreshes all fundamentals in one day.
"""

from __future__ import annotations

import time
from datetime import date

from sqlalchemy import select

from app.config import settings
from app.core.cache import _key, cache_get, cache_set
from app.core.logging import get_logger
from app.core.ratelimit import BudgetExhausted
from app.data import fmp, market_snapshot, sec, yahoo
from app.data.liquid_universe import LIQUID_TICKERS
from app.data.universe import active_tickers, upsert_universe
from app.db.models import Company, ScanResult
from app.db.session import session_scope
from app.quant import prefilter
from app.quant.fundamental import compute_fundamentals
from app.quant.scoring import compute_scores
from app.quant.technical import compute_technicals
from app.services import ingest, jobs

log = get_logger("scanner")


def _gate(tech: dict, p: dict) -> bool:
    """Liquidity / tradability filter using only cheap yahoo-derived stats."""
    price = tech.get("last_price")
    if price is None or price < p["min_price"]:
        return False
    adv = (tech.get("extra") or {}).get("avg_dollar_volume")
    if adv is None or adv < p["min_dollar_vol"]:
        return False
    return True


# Daily bars change once a day, so a re-scan inside this window costs ZERO Yahoo
# requests. This is the single reason a repeat scan can finish in seconds — it is
# what made the original daddiesmoney scanner feel instant on the second run.
_PRICE_TTL = 4 * 3600


def _cached_batch(batch: list[str], period: str, use_cache: bool) -> tuple[dict, bool]:
    """Fetch one chunk of daily bars. Returns (frames, came_from_cache).

    Caching is deliberately bounded: a few hundred frames is a few MB and makes a
    re-scan instant, but memoizing thousands would hold hundreds of MB and risk
    an OOM on a small container — the exact problem streaming was added to solve.
    """
    if not use_cache:
        return yahoo.download_batch(batch, period=period), False
    key = _key("bars", period, ",".join(batch))
    hit = cache_get(key)
    if hit is not None:
        return hit, True
    frames = yahoo.download_batch(batch, period=period)
    if frames:
        cache_set(key, frames, _PRICE_TTL)
    return frames, False


def _fmp_bundle(ticker: str, deadline: float | None = None) -> dict:
    """Fetch one company's FMP statements, checking the stage deadline BEFORE each
    call. Six sequential HTTP calls (each with its own retry budget) can otherwise
    hang a single candidate for minutes, so the deadline is enforced per-call and
    whatever was fetched so far is returned.
    """
    out: dict = {}
    for key, fn in (
        ("profile", fmp.profile),
        ("income", fmp.income_statement),
        ("cashflow", fmp.cash_flow),
        ("ratios", fmp.ratios),
        ("key_metrics", fmp.key_metrics),
        ("balance", fmp.balance_sheet),
    ):
        if deadline is not None and time.time() >= deadline:
            break
        out[key] = fn(ticker)
    return out


def _resolve_params(params: dict | None) -> dict:
    params = params or {}
    return {
        # "full" = the entire SEC universe (~10k listings, ~6k with usable prices);
        # "liquid" = the curated ~1.5k shortlist for a much faster scan.
        "universe": params.get("universe", settings.scan_universe),
        "universe_limit": params.get("universe_limit"),
        "price_batch": params.get("price_batch", settings.scan_price_batch),
        "prefilter_keep": params.get("prefilter_keep", settings.scan_prefilter_keep),
        "deep_seconds": params.get("deep_seconds", settings.scan_deep_seconds),
        "min_price": params.get("min_price", settings.universe_min_price),
        "min_dollar_vol": params.get("min_dollar_vol", settings.universe_min_avg_dollar_volume),
        "min_market_cap": params.get("min_market_cap", settings.universe_min_market_cap),
        "technical_keep": params.get("technical_keep", settings.scan_technical_keep),
        "top_n": params.get("top_n", settings.scan_top_n),
        "enrich": params.get("enrich", True),
        # Hard wall-clock cap on the (rate-limited) FMP enrichment stage so the
        # scan always finishes; names not enriched in time are scored technical-only.
        "enrich_seconds": params.get("enrich_seconds", settings.scan_enrich_seconds),
        "sec_fallback": params.get("sec_fallback", False),
        "weights": params.get("weights"),
        "price_period": params.get("price_period", "1y"),
    }


def run_scan(scan_run_id: int, job_id: str, params: dict | None = None) -> dict:
    p = _resolve_params(params)
    as_of = date.today()

    def progress(pct: int, stage: str):
        jobs.update_job(job_id, status="running", progress=pct, stage=stage)
        jobs.update_scan_run(scan_run_id, stage=stage, progress=pct)
        log.info("scan progress", extra={"scan_run": scan_run_id, "pct": pct, "stage": stage})

    # ---- Stage 1: universe -------------------------------------------------
    progress(3, "Loading universe")
    with session_scope() as s:
        # Company rows must exist for id/cik lookups; seed once from SEC if empty.
        if not active_tickers(s, limit=1):
            upsert_universe(s)

        if p["universe"] == "full":
            # Deep scan: the entire SEC universe (~10k names — minutes, opt-in).
            tickers = active_tickers(s, limit=p["universe_limit"])
        else:
            # Fast default: curated, sector-tagged liquid shortlist (~250 names).
            tickers = list(LIQUID_TICKERS)
            if p["universe_limit"]:
                tickers = tickers[: p["universe_limit"]]

        cmap = {t: (cid, cik) for cid, t, cik in
                s.execute(select(Company.id, Company.ticker, Company.cik)
                          .where(Company.ticker.in_(tickers))).all()}
    # Keep only names seeded in the company table (drops any liquid ticker not in
    # SEC's list, e.g. some ETFs); a no-op for the full universe.
    tickers = [t for t in tickers if t in cmap]
    jobs.update_scan_run(scan_run_id, universe_size=len(tickers), counts_merge={"universe": len(tickers)})

    # ---- Stage 1b: whole-market snapshot + cheap prefilter -----------------
    # yfinance costs ONE HTTP request per ticker, and compute_technicals costs
    # ~4.5ms each (~46s for 10.3k names on one core) — both scale with the number
    # of names that reach them. Yahoo's *quote* endpoint IS batched, so ~70
    # requests buy us price/volume/SMA/52w for the entire universe, enough to gate
    # and pre-rank. Only the survivors pay for history. Best-effort: if the
    # snapshot is unavailable we simply scan everything, exactly as before.
    snapshot: dict[str, dict] = {}
    if p["prefilter_keep"] and len(tickers) > p["prefilter_keep"]:
        progress(6, f"Snapshotting {len(tickers)} tickers")
        try:
            snapshot = market_snapshot.whole_market(
                tickers,
                on_progress=lambda d, t: progress(6 + int(5 * d / max(1, t)),
                                                  f"Snapshot {d}/{t} batches"),
            )
        except Exception as exc:  # noqa: BLE001 — never let this break a scan
            log.warning("market snapshot failed; scanning full universe", extra={"err": str(exc)})
            snapshot = {}

    prefiltered = False
    if snapshot and len(snapshot) >= len(tickers) * 0.5:
        # every name with a usable quote is genuinely scored here, not skipped
        analyzed = sum(1 for r in snapshot.values() if r and r.get("price") is not None)
        liquid = prefilter.liquidity_gate(snapshot, min_price=p["min_price"],
                                          min_dollar_vol=p["min_dollar_vol"])
        candidates = prefilter.prerank(snapshot, liquid, keep=p["prefilter_keep"])
        if candidates:
            log.info("prefilter narrowed universe",
                     extra={"universe": len(tickers), "analyzed": analyzed,
                            "liquid": len(liquid), "candidates": len(candidates)})
            jobs.update_scan_run(scan_run_id, counts_merge={
                "snapshot": len(snapshot), "analyzed": analyzed,
                "liquid": len(liquid), "candidates": len(candidates)})
            tickers = candidates
            prefiltered = True
    if not prefiltered and len(tickers) > p["prefilter_keep"]:
        # The fast path is off. Say so loudly rather than silently taking minutes:
        # without the snapshot every name needs its own history request.
        reason = ("snapshot returned no rows" if not snapshot
                  else f"snapshot covered only {len(snapshot)}/{len(tickers)}")
        log.warning("PREFILTER OFF — falling back to the slow full-universe scan",
                    extra={"reason": reason, "tickers": len(tickers)})
        jobs.update_scan_run(scan_run_id, counts_merge={
            "degraded": True, "degraded_reason": reason})
        progress(11, f"Market snapshot unavailable ({reason}) — scanning directly")

    # ---- Stage 2+3+4: STREAMED prices -> technicals -> liquidity gate ------
    # Streaming is what makes a full ~10k-name scan viable: prices arrive one
    # batch at a time, each batch is reduced to small technical dicts, and the
    # DataFrames are dropped immediately. Holding every frame at once (6k x ~250
    # rows) costs hundreds of MB and is what made big scans crawl or die.
    # The deep stage is TIME-BUDGETED rather than count-capped: names are already
    # ordered best-first by the snapshot pre-rank, so we work down that list until
    # the budget is spent. A fast network analyses more names, a slow one still
    # finishes on schedule, and either way we never blow the scan's total time.
    total_t = max(1, len(tickers))
    deep_deadline = time.time() + max(3, int(p["deep_seconds"]))
    progress(12, f"Fetching prices for {len(tickers)} tickers")
    survivors: list[dict] = []
    priced = 0
    deep_done = 0
    batch_size = int(p["price_batch"])
    # Only memoize bars for a modest candidate set (see _cached_batch).
    cache_bars = len(tickers) <= settings.scan_cache_max
    for i in range(0, len(tickers), batch_size):
        if i and time.time() >= deep_deadline:
            log.info("deep stage budget spent",
                     extra={"processed": i, "of": len(tickers), "priced": priced})
            break
        batch = tickers[i:i + batch_size]
        cached = False
        try:
            frames, cached = _cached_batch(batch, p["price_period"], cache_bars)
        except Exception as exc:  # a bad batch must not kill the scan
            log.warning("price batch failed", extra={"start": i, "err": str(exc)})
            frames = {}
        for t in batch:
            df = frames.get(t)
            if df is None or df.empty:
                continue
            priced += 1
            tech = compute_technicals(df)
            if not tech or not _gate(tech, p):
                continue
            cid = (cmap.get(t) or (None, None))[0]
            if cid is None:
                continue
            # note: no DataFrame retained — prices for the finalists are re-fetched
            survivors.append({"ticker": t, "company_id": cid, "cik": cmap[t][1], "tech": tech})
        if not cached:
            frames.clear()          # free the frames — unless they're the cache's
        done = min(i + batch_size, len(tickers))
        deep_done = done
        # Progress is scaled against what the time budget can realistically reach,
        # not the full candidate list — otherwise the bar crawls toward a target
        # the stage was never going to finish, which reads as a stall.
        spent = time.time() - (deep_deadline - max(3, int(p["deep_seconds"])))
        pace = done / max(0.5, spent)                     # tickers per second
        reachable = min(len(tickers), max(done, int(pace * max(3, int(p["deep_seconds"])))))
        progress(12 + int(43 * min(1.0, done / max(1, reachable))),
                 f"Deep-analysed {done} of ~{reachable} · {len(survivors)} pass liquidity"
                 f" · {pace:.0f}/s")

    survivors.sort(key=lambda x: (x["tech"].get("trend_score") or 0,
                                  x["tech"].get("momentum") or -1), reverse=True)
    jobs.update_scan_run(scan_run_id, counts_merge={
        "priced": priced, "survivors": len(survivors), "deep": deep_done})

    keep = survivors[: p["technical_keep"]]

    # Re-fetch price history for the finalists only, so their candles can be
    # persisted for the detail-page chart (a single small batched call).
    if keep:
        progress(56, f"Loading price history for {len(keep)} finalists")
        try:
            keep_frames = yahoo.fetch_prices_bulk([c["ticker"] for c in keep],
                                                  period=p["price_period"])
        except Exception as exc:  # noqa: BLE001
            log.warning("finalist price refetch failed", extra={"err": str(exc)})
            keep_frames = {}
        for cand in keep:
            cand["df"] = keep_frames.get(cand["ticker"])

    # ---- Stage 5: staged fundamental enrichment (budget- + time-bounded) ---
    progress(60, f"Enriching top {len(keep)} candidates (fundamentals)")
    # FMP is off when no key is set (scan stays fast, technical-only), and the
    # whole stage is capped by a wall-clock deadline so a slow/rate-limited FMP
    # can never stall the scan — remaining names are scored technical-only.
    fmp_enabled = bool(p["enrich"] and settings.fmp_api_key)
    fmp_exhausted = not fmp_enabled
    enrich_deadline = time.time() + max(5, int(p["enrich_seconds"]))
    ranked: list[dict] = []
    total = max(1, len(keep))
    for i, cand in enumerate(keep):
        ticker, cid, cik = cand["ticker"], cand["company_id"], cand["cik"]
        fund: dict | None = None
        source = "none"

        # Report BEFORE the slow work, not after: otherwise the UI sits on the
        # stage's opening message for as long as the first candidate takes, which
        # is indistinguishable from a hang.
        mode = "technical-only" if fmp_exhausted else "fundamentals"
        progress(60 + int(25 * i / total), f"Scoring {i + 1}/{len(keep)} {ticker} · {mode}")

        if not fmp_exhausted and time.time() >= enrich_deadline:
            fmp_exhausted = True
            log.info("FMP enrichment time budget reached; remaining names technical-only",
                     extra={"at_index": i, "seconds": p["enrich_seconds"]})

        if fmp_enabled and not fmp_exhausted:
            try:
                bundle = _fmp_bundle(ticker, enrich_deadline)
                if bundle and any(bundle.values()):
                    fund = compute_fundamentals(bundle)
                    source = "fmp"
                    prof = bundle.get("profile") or {}
                    _update_company_profile(cid, prof)
            except BudgetExhausted:
                fmp_exhausted = True
                log.info("FMP daily budget spent; remaining names scored technical-only",
                         extra={"at_index": i})

        # SEC Company Facts is a multi-MB per-company download — far too heavy to
        # run for hundreds of names in a live scan, so it's opt-in (default off).
        # Names without FMP fundamentals are scored technical-only now and picked
        # up by FMP as the daily budget cycles. (Reports still use SEC on demand.)
        if fund is None and p["enrich"] and p["sec_fallback"] and cik:
            try:
                facts = sec.company_facts(cik)
                if facts:
                    fund = compute_fundamentals({}, sec.facts_financials(facts))
                    source = "sec_facts"
            except Exception as exc:  # noqa: BLE001
                log.debug("sec facts enrich failed", extra={"ticker": ticker, "err": str(exc)})

        scores = compute_scores(cand["tech"], fund, weights=p["weights"])

        with session_scope() as s:
            df = cand.get("df")            # None if the finalist re-fetch missed it
            if df is not None and not df.empty:
                ingest.upsert_prices(s, cid, df)
            ingest.save_technicals(s, cid, cand["tech"], as_of=as_of)
            if fund:
                ingest.save_fundamentals(s, cid, fund, source=source)

        ranked.append({"ticker": ticker, "company_id": cid, "scores": scores,
                       "total": scores.get("total_score") or 0})


    jobs.update_scan_run(scan_run_id, counts_merge={"enriched": len(ranked)})

    # ---- Stage 6: composite ranking + persist -----------------------------
    progress(90, "Ranking + writing results")
    ranked.sort(key=lambda x: x["total"], reverse=True)
    top = ranked[: p["top_n"]]
    with session_scope() as s:
        for rank, r in enumerate(ranked, start=1):
            ingest.save_scores(s, r["company_id"], r["scores"],
                               scan_run_id=scan_run_id, rank=rank, as_of=as_of)
        _write_scan_results(s, scan_run_id, ranked)

    counts = {"universe": len(tickers), "priced": len(frames),
              "survivors": len(survivors), "enriched": len(ranked), "top_n": len(top)}
    jobs.update_scan_run(scan_run_id, counts_merge=counts)
    jobs.update_job(job_id, status="succeeded", progress=100, stage="done",
                    result_ref={"scan_run_id": scan_run_id, "top_n": len(top)})
    log.info("scan complete", extra={"scan_run": scan_run_id, **counts})
    return {"scan_run_id": scan_run_id, **counts}


def _update_company_profile(company_id: int, profile: dict) -> None:
    if not profile:
        return
    with session_scope() as s:
        c = s.get(Company, company_id)
        if not c:
            return
        c.sector = profile.get("sector") or c.sector
        c.industry = profile.get("industry") or c.industry
        c.exchange = profile.get("exchangeShortName") or profile.get("exchange") or c.exchange
        if profile.get("mktCap"):
            c.market_cap = profile["mktCap"]
        if profile.get("companyName"):
            c.name = c.name or profile["companyName"]


def _write_scan_results(session, scan_run_id: int, ranked: list[dict]) -> None:
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    for rank, r in enumerate(ranked, start=1):
        sc = r["scores"]
        payload = {
            "scan_run_id": scan_run_id, "company_id": r["company_id"], "rank": rank,
            "total_score": sc.get("total_score"), "recommendation": sc.get("recommendation"),
            "sub_scores": {k: sc.get(k) for k in (
                "technical_score", "fundamental_score", "growth_score",
                "value_score", "quality_score", "risk_score")},
        }
        stmt = pg_insert(ScanResult).values(payload)
        stmt = stmt.on_conflict_do_update(
            constraint="uq_scanresult_run_company",
            set_={k: stmt.excluded[k] for k in ("rank", "total_score", "recommendation", "sub_scores")},
        )
        session.execute(stmt)
