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

from datetime import date

from sqlalchemy import select

from app.config import settings
from app.core.logging import get_logger
from app.core.ratelimit import BudgetExhausted
from app.data import fmp, sec, yahoo
from app.data.universe import active_tickers, upsert_universe
from app.db.models import Company, ScanResult
from app.db.session import session_scope
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


def _fmp_bundle(ticker: str) -> dict:
    return {
        "profile": fmp.profile(ticker),
        "income": fmp.income_statement(ticker),
        "balance": fmp.balance_sheet(ticker),
        "cashflow": fmp.cash_flow(ticker),
        "ratios": fmp.ratios(ticker),
        "key_metrics": fmp.key_metrics(ticker),
    }


def _resolve_params(params: dict | None) -> dict:
    params = params or {}
    return {
        "universe_limit": params.get("universe_limit"),
        "min_price": params.get("min_price", settings.universe_min_price),
        "min_dollar_vol": params.get("min_dollar_vol", settings.universe_min_avg_dollar_volume),
        "min_market_cap": params.get("min_market_cap", settings.universe_min_market_cap),
        "technical_keep": params.get("technical_keep", settings.scan_technical_keep),
        "top_n": params.get("top_n", settings.scan_top_n),
        "enrich": params.get("enrich", True),
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
        tickers = active_tickers(s, limit=p["universe_limit"])
        if not tickers:
            upsert_universe(s)
            tickers = active_tickers(s, limit=p["universe_limit"])
        cmap = {t: (cid, cik) for cid, t, cik in
                s.execute(select(Company.id, Company.ticker, Company.cik)
                          .where(Company.ticker.in_(tickers))).all()}
    jobs.update_scan_run(scan_run_id, universe_size=len(tickers), counts_merge={"universe": len(tickers)})

    # ---- Stage 2: bulk prices (yahoo, unlimited) --------------------------
    progress(12, f"Fetching prices for {len(tickers)} tickers")
    frames = yahoo.fetch_prices_bulk(tickers, period=p["price_period"])

    # ---- Stage 3+4: gate + technical ranking ------------------------------
    progress(45, "Computing technicals + liquidity gate")
    survivors: list[dict] = []
    for t in tickers:
        df = frames.get(t)
        tech = compute_technicals(df)
        if not tech or not _gate(tech, p):
            continue
        cid = (cmap.get(t) or (None, None))[0]
        if cid is None:
            continue
        survivors.append({"ticker": t, "company_id": cid, "cik": cmap[t][1],
                          "tech": tech, "df": df})
    survivors.sort(key=lambda x: (x["tech"].get("trend_score") or 0,
                                  x["tech"].get("momentum") or -1), reverse=True)
    jobs.update_scan_run(scan_run_id, counts_merge={"priced": len(frames), "survivors": len(survivors)})

    keep = survivors[: p["technical_keep"]]

    # ---- Stage 5: staged fundamental enrichment (budget-aware) ------------
    progress(60, f"Enriching top {len(keep)} candidates (fundamentals)")
    fmp_exhausted = False
    ranked: list[dict] = []
    total = max(1, len(keep))
    for i, cand in enumerate(keep):
        ticker, cid, cik = cand["ticker"], cand["company_id"], cand["cik"]
        fund: dict | None = None
        source = "none"

        if p["enrich"] and not fmp_exhausted:
            try:
                bundle = _fmp_bundle(ticker)
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
            ingest.upsert_prices(s, cid, cand["df"])
            ingest.save_technicals(s, cid, cand["tech"], as_of=as_of)
            if fund:
                ingest.save_fundamentals(s, cid, fund, source=source)

        ranked.append({"ticker": ticker, "company_id": cid, "scores": scores,
                       "total": scores.get("total_score") or 0})

        if i % 10 == 0:
            progress(60 + int(25 * i / total), f"Enriched {i}/{len(keep)} ({source})")

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
