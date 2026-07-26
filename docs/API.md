# REST API — FastAPI (`api` service)

Base URL: `/api/v1`. JSON in/out. Auth: single-user **bearer token**.

```
Authorization: Bearer <APP_TOKEN>
```

Every endpoint except `GET /health` and `POST /auth/login` requires the header.
Long-running work returns a `job_id`; poll `GET /jobs/{id}`.

---

## Auth
| Method | Path                | Body                | Returns                          |
|--------|---------------------|---------------------|----------------------------------|
| POST   | `/auth/login`       | `{ "token": "..." }`| `{ ok, expires_at }` — validates the token, sets it (frontend stores in httpOnly cookie). |
| GET    | `/auth/me`          | —                   | `{ authenticated: true }`        |

There is exactly one credential: `APP_TOKEN` (env). No user table, no signup.

## Health / meta
| Method | Path        | Returns                                                    |
|--------|-------------|------------------------------------------------------------|
| GET    | `/health`   | `{ status, db, redis, version }` — liveness for Railway.   |
| GET    | `/meta/providers` | per-provider budget remaining (FMP calls left today, Polygon bucket, etc.) |

## Market / dashboard
| Method | Path                  | Returns                                                     |
|--------|-----------------------|-------------------------------------------------------------|
| GET    | `/market/overview`    | index snapshots, breadth, avg sentiment, universe/coverage stats. |
| GET    | `/market/top?limit=`  | latest ranked stocks (from most recent scan) with scores + recommendation. |
| GET    | `/market/sentiment`   | aggregate news sentiment trend (from GDELT/Finnhub).        |
| GET    | `/reports/recent?limit=` | recently generated AI reports (company, recommendation, confidence, date). |

## Scanner
| Method | Path                        | Body / Query                                   | Returns |
|--------|-----------------------------|------------------------------------------------|---------|
| POST   | `/scanner/run`              | `{ filters?, weights?, top_n? }`               | `{ job_id, scan_run_id }` — starts the funnel (§ARCHITECTURE 5). This is **"Find Best Stocks"**. |
| GET    | `/scanner/runs?limit=`      | —                                              | list of scan runs with status/progress/counts. |
| GET    | `/scanner/runs/{id}`        | —                                              | one run: stage progress, timings, budget used. |
| GET    | `/scanner/results/{run_id}` | `?sort=&sector=&min_score=&limit=&offset=`     | ranked results: rank, ticker, name, sector, sub-scores, total, recommendation. Supports sorting/filtering/paging for the Scanner page. |
| GET    | `/scanner/latest`           | filters as above                               | results of the most recent successful run.     |

## Companies / research
| Method | Path                                | Returns                                                    |
|--------|-------------------------------------|------------------------------------------------------------|
| GET    | `/companies?q=&sector=&limit=`      | search/browse companies.                                   |
| GET    | `/companies/{ticker}`               | profile: name, sector, industry, market cap, latest scores.|
| GET    | `/companies/{ticker}/prices?range=` | OHLCV series for the chart (`1M/3M/6M/1Y/5Y`).             |
| GET    | `/companies/{ticker}/technicals`    | latest technical_metrics.                                  |
| GET    | `/companies/{ticker}/fundamentals`  | financial_data history (annual+quarter).                   |
| GET    | `/companies/{ticker}/filings`       | SEC filings list (type, date, url, has-summary).           |
| GET    | `/companies/{ticker}/filings/{id}`  | filing detail + summary.                                   |
| GET    | `/companies/{ticker}/news?limit=`   | news timeline with sentiment.                              |
| GET    | `/companies/{ticker}/scores`        | current + historical scores.                               |
| GET    | `/companies/{ticker}/report`        | latest AI report (full structured object).                 |
| POST   | `/companies/{ticker}/report`        | trigger generation of a fresh AI report → `{ job_id }`.    |
| POST   | `/companies/{ticker}/refresh`       | force ingest (price+fundamentals+filings+news) → `{ job_id }`. |
| GET    | `/companies/{ticker}/quote`         | on-demand real-time quote (Polygon, rate-limited).         |

## Portfolio
| Method | Path                  | Body                                             | Returns |
|--------|-----------------------|--------------------------------------------------|---------|
| GET    | `/portfolio`          | —                                                | holdings + live P/L (using latest close) + status. |
| POST   | `/portfolio`          | `{ ticker, shares, entry_price, entry_date, thesis }` | created holding. |
| PATCH  | `/portfolio/{id}`     | partial fields                                   | updated holding. |
| DELETE | `/portfolio/{id}`     | —                                                | `{ ok }`. |
| GET    | `/portfolio/analysis` | —                                                | AI/portfolio-level summary (exposure, risk, per-name status). |

## Jobs (async work)
| Method | Path            | Returns                                                        |
|--------|-----------------|----------------------------------------------------------------|
| GET    | `/jobs/{id}`    | `{ id, type, status, progress, stage, result_ref, error }`.    |
| GET    | `/jobs?limit=`  | recent jobs.                                                   |

`status ∈ {queued, running, succeeded, failed}`. `progress` is 0–100 with a human
`stage` label (e.g. "Ranking technicals: 1200/1500"). The frontend polls this to
drive the "Find Best Stocks" progress UI.

---

## Standard shapes
**Error**
```json
{ "error": { "code": "rate_limited", "message": "...", "provider": "fmp", "retry_after": 3600 } }
```
**Score object**
```json
{
  "technical": 82, "fundamental": 71, "growth": 88, "value": 40,
  "quality": 76, "risk": 63, "total": 74,
  "recommendation": "Buy", "as_of": "2026-07-22"
}
```
**AI report object** — mirrors `ai_reports` (overview, thesis, bull_case, bear_case,
catalysts[], risks[], technical_analysis, fundamental_analysis, recommendation,
confidence, scores_snapshot, created_at).

## Conventions
- Times are ISO-8601 UTC. Money is a JSON number in USD.
- Missing metric → `null` (never fabricated).
- Pagination via `limit`/`offset`; list endpoints also return `total`.
- Rate-limited provider passthroughs (`/quote`) may return `503` + `retry_after`
  when a bucket is empty — the UI shows "temporarily rate-limited", never fake data.
