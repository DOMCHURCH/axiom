# Daddiesmoney — AI Equity Research Terminal · Architecture

> A manually-triggered, AI-powered stock research & decision-support platform.
> **Not** an autonomous trader. The user clicks **"Find Best Stocks"**; the system
> scans the market, ranks opportunities, and writes professional research reports.

---

## 1. High-level overview

```
                         ┌───────────────────────────────────────────────┐
                         │                  Railway Project               │
                         │                                                │
  Browser ──HTTPS──▶  ┌──┴─────────┐   REST/JSON   ┌──────────────┐       │
                      │  frontend  │ ────────────▶ │     api      │       │
                      │ Next.js 16 │ ◀──────────── │   FastAPI    │       │
                      └────────────┘               └──────┬───────┘       │
                                                          │ enqueue jobs  │
                                                          ▼               │
                                                   ┌────────────┐         │
                                                   │   redis    │◀────┐   │
                                                   │ broker+cache│    │   │
                                                   └──────┬─────┘     │   │
                                                          │ consume   │   │
                                                          ▼           │   │
                                                   ┌────────────┐     │   │
                                                   │   worker   │─────┘   │
                                                   │  Celery    │  cache  │
                                                   │ scanner +  │         │
                                                   │ quant + AI │         │
                                                   └──────┬─────┘         │
                                                          │ SQLAlchemy    │
                                                          ▼               │
                                                   ┌────────────┐         │
                                                   │  postgres  │         │
                                                   │ + pgvector │         │
                                                   └────────────┘         │
                         └───────────────────────────────────────────────┘

  External data providers (called only by api/worker, never the browser):
  yfinance · Financial Modeling Prep · SEC EDGAR + Company Facts ·
  Finnhub · GDELT · Polygon/Massive · OpenRouter (GLM-5.2)
```

Five Railway services:

| Service    | Tech                    | Responsibility                                                        |
|------------|-------------------------|----------------------------------------------------------------------|
| `frontend` | Next.js 16 (App Router) | Terminal UI. Talks to `api` only. No direct DB or provider access.    |
| `api`      | FastAPI (async)         | REST endpoints, auth, reads DB, enqueues jobs, streams job status.    |
| `worker`   | Celery                  | Scanner funnel, quant engine, AI report generation, data ingestion.   |
| `postgres` | Postgres 16 + pgvector  | System of record + vector store for filing embeddings.                |
| `redis`    | Redis 7                 | Celery broker/result backend + response/data cache + rate-limit state.|

`api` and `worker` are **the same Python package** (`app/`) deployed twice with
different start commands. One codebase, one set of SQLAlchemy models, no drift.

> **Shipped deploy (lean, 3 services).** To fit small Railway plans, the production
> build collapses this to **Postgres + `backend` + `frontend`**. Redis and the separate
> Celery worker are replaced by an in-process thread-pool job runner (progress written to
> the Postgres `jobs` table), an in-memory TTL cache, and Postgres-persisted daily API
> budgets (`provider_usage`). The scanner funnel, quant engine, AI engine, and REST API
> are byte-for-byte identical. See `DEPLOYMENT.md`.

---

## 2. Design principles

1. **Deterministic math, narrative AI.** All numbers (indicators, ratios, scores)
   are computed in Python and stored. GLM-5.2 only *reads* those numbers plus
   filings/news and writes prose. The AI never calculates a score or a metric.
2. **Cheap-before-expensive funnel.** yfinance (unlimited) scans the whole
   universe; only survivors consume FMP (250/day) and SEC. Rate-limited providers
   are touched last and least. See §5.
3. **Cache everything with sane TTLs.** Every external response is cached in Redis
   and/or persisted in Postgres. We never re-hit an API for data we already hold
   and that hasn't gone stale.
4. **Idempotent, resumable jobs.** A scan run records progress; re-running skips
   work already done. Enrichment is a priority queue that survives restarts.
5. **One source of schema truth.** SQLAlchemy models + Alembic own Postgres.
   The frontend is REST-only (no second ORM, no dual migrations).
6. **Never fabricate data.** If a provider fails or a metric is unavailable, the
   value is `NULL` and the UI/report says "unavailable" — we do not invent numbers.

---

## 3. Component detail

### 3.1 `frontend` — Next.js 16 terminal
- App Router, TypeScript, Tailwind, Framer Motion.
- Charts: **TradingView Lightweight Charts** (price) + **Recharts** (scores/metrics).
- Pages: Dashboard, Scanner, Stock Research, Portfolio (see `API.md` for data).
- Auth: single bearer token entered once, stored in an httpOnly cookie via a Next
  route handler; all `api` calls carry it. No provider keys ever reach the client.
- Talks exclusively to `api` through a thin typed REST client (`lib/api.ts`).

### 3.2 `api` — FastAPI
- Async, Pydantic v2 models, dependency-injected DB sessions.
- Responsibilities: authentication, read models from Postgres, expose scanner
  results / reports / portfolio, and **enqueue** long jobs onto Celery.
- Long operations (`Find Best Stocks`, per-ticker deep research) return a
  `job_id` immediately; the client polls `/jobs/{id}` for status/progress.
- Never blocks a request on a slow provider call — those happen in the worker.

### 3.3 `worker` — Celery
Task families:
- **Ingestion** — universe refresh, bulk price download, fundamentals enrichment,
  filings fetch/embed, news/sentiment pull.
- **Quant** — compute technical + fundamental metrics and the six sub-scores.
- **Scan** — orchestrates the full funnel (§5) as a chord of subtasks.
- **AI** — generate an equity research report for a company from stored context.

Concurrency is tuned per provider via rate limiters (§6) so we respect every quota.

### 3.4 `postgres` + pgvector
System of record. `pgvector` stores per-chunk embeddings of SEC filings for
retrieval-augmented report generation. Full schema in `DATABASE.md`.

### 3.5 `redis`
- Celery broker + result backend.
- Cache layer: keyed provider responses with TTLs (§6).
- Distributed token-bucket state for provider rate limiters.

---

## 4. Data providers & how each is used

| Provider            | Key? | Quota                | Used for                                             | Cache TTL |
|---------------------|------|----------------------|------------------------------------------------------|-----------|
| yfinance (Yahoo)    | no   | unlimited (fair use) | Bulk daily OHLCV for the whole universe; technicals  | 1 trading day |
| Financial Modeling Prep | yes | **250/day**      | Income/balance/cash-flow, ratios, profile, valuation | 7 days |
| SEC EDGAR           | no*  | unlimited            | 10-K/10-Q/8-K filings text                            | 30 days |
| SEC Company Facts   | no*  | unlimited            | Structured XBRL fundamentals (revenue, EPS, assets…) | 7 days |
| Finnhub             | yes  | 60/min               | Earnings calendar/surprises, insider tx, analyst, news | 1–6 h |
| GDELT               | no   | unlimited            | News volume + tone/sentiment by company              | 6 h |
| Polygon/Massive     | yes  | **5/min, 7200/day**  | Real-time / intraday snapshots (used sparingly)      | 1–5 min |
| OpenRouter (GLM-5.2)| yes  | budget-limited       | AI equity research narrative                         | report cached until inputs change |

\* SEC requires a descriptive `User-Agent` (`SEC_USER_AGENT`), not a key.

**Budget rules baked into the code:**
- FMP: hard cap of 250 calls/rolling-24h enforced by a Redis counter. Enrichment
  is a *priority queue* — highest-ranked technical candidates first. When the
  budget is spent, remaining names fall back to SEC Company Facts (free) or wait
  for the next day.
- Polygon: token bucket at 5/min **and** a 7200/day ceiling; only used for
  on-demand real-time quotes on the Research page, never in bulk scanning.
- OpenRouter: reports are only generated on explicit user trigger and cached;
  a per-run report cap prevents runaway spend.

---

## 5. The scanner funnel ("Find Best Stocks")

Cheap, unlimited data does the heavy filtering; expensive data only touches
names that already earned attention.

```
[1] Universe            SEC company_tickers.json → ~6000+ US common stocks
        │                (filtered to tradable common shares)
        ▼
[2] Bulk price scan     yfinance batch download OHLCV (unlimited)  ── full universe
        │
        ▼
[3] Liquidity/tech gate  drop: price < $ floor, thin avg $-volume,
        │                micro-cap below floor, non-tradable  ── ~6000 → ~1500
        ▼
[4] Technical ranking   RSI/MACD/SMA/EMA/BB/ATR/vol/momentum/trend
        │                → Technical Score (0-100), rank        ── ~1500 ranked
        ▼
[5] Staged enrichment   top-N technical candidates ONLY pull FMP + SEC facts
        │                (250/day budget, priority queue, TTL cache) ── ~300 enriched
        ▼
[6] Full scoring        Fundamental/Growth/Value/Quality/Risk sub-scores
        │                → weighted Composite Score, final rank
        ▼
[7] Top 100             Rank · Ticker · Name · Sector · Score · Recommendation
        │
        ▼
[8] AI reports          generated on demand for the picks the user opens
```

Each stage persists its output, so a run is resumable and the next run reuses
fresh cached data. Fundamentals are **never** refreshed for the whole universe
in a day — only for names that pass stage [4].

---

## 6. Cross-cutting: caching, rate limiting, retries, logging

- **Cache** (`app/core/cache.py`): `cached(key, ttl)` helper backed by Redis;
  provider clients wrap every call. Cache keys are provider+endpoint+params.
- **Rate limiting** (`app/core/ratelimit.py`): distributed token-bucket per
  provider in Redis (FMP 250/day, Finnhub 60/min, Polygon 5/min+7200/day). A call
  blocks or defers until a token is available; budget-exhaustion is a first-class,
  logged outcome, not an error.
- **Retries** (`app/core/http.py`): shared async HTTP client with exponential
  backoff + jitter on 429/5xx/timeouts, capped attempts, and per-provider timeouts.
- **Logging**: structured JSON logs (provider, endpoint, latency, cache hit/miss,
  budget remaining). Every scan run and AI report is auditable.

---

## 7. Local dev vs Railway

| Concern   | Local dev                          | Railway                                    |
|-----------|------------------------------------|--------------------------------------------|
| Postgres  | `docker-compose` pgvector image    | Postgres plugin + `CREATE EXTENSION vector`|
| Redis     | `docker-compose` redis image       | Redis plugin                               |
| api       | `uvicorn app.main:app --reload`    | Dockerfile, start `uvicorn` (gunicorn/uvicorn workers) |
| worker    | `celery -A app.worker.celery worker` | same image, start `celery ... worker`    |
| frontend  | `next dev`                         | Dockerfile, `next start`                   |
| Secrets   | `.env` (gitignored)                | Railway service variables (see `.env.example`) |

Migrations run via Alembic on deploy (release command). See `docs/DEPLOYMENT.md`
(added in the deployment phase).

---

## 8. Repository layout

```
daddiesmoney/
├── docs/                      ARCHITECTURE.md · DATABASE.md · API.md · DEPLOYMENT.md
├── backend/                   Python package shared by api + worker
│   ├── app/
│   │   ├── main.py            FastAPI entrypoint
│   │   ├── config.py          pydantic-settings (env)
│   │   ├── core/              http, cache, ratelimit, logging, security
│   │   ├── db/                base, session, models.py
│   │   ├── api/               routers + deps (auth, db session)
│   │   ├── data/              provider clients + universe loader
│   │   ├── quant/             technical, fundamental, scoring
│   │   ├── ai/                openrouter client, embeddings, rag, report
│   │   └── worker/            celery app + tasks (ingest, scan, ai)
│   ├── alembic/               migrations
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                  Next.js 16 app (Dockerfile inside)
├── docker-compose.yml         local Postgres + Redis (+ optional api/worker)
├── .env.example               documented env template
├── .env                       real secrets (gitignored)
└── README.md
```

See `DATABASE.md` for the schema and `API.md` for the REST contract.
