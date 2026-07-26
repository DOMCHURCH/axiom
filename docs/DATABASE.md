# Database Schema — Postgres 16 + pgvector

Owned end-to-end by **SQLAlchemy models + Alembic migrations** (`backend/app/db/models.py`).
The frontend never touches Postgres directly.

Conventions:
- All tables have `id BIGINT` surrogate PK (except `portfolio` notes below), plus
  `created_at` / `updated_at` (UTC) where mutable.
- Money/ratio columns are `NUMERIC` (exact), not float, to avoid drift.
- A metric that a provider didn't return is stored as `NULL`. We never invent values.
- `vector` columns require `CREATE EXTENSION IF NOT EXISTS vector;` (first migration).
- Embedding dimension is `EMBEDDING_DIM` (default **384**, local `bge-small`/`MiniLM`).

---

## Entity relationship (summary)

```
companies 1───∞ stock_prices
          1───∞ financial_data
          1───∞ sec_filings 1───∞ filing_chunks(vector)
          1───∞ news_articles
          1───∞ technical_metrics
          1───∞ stock_scores
          1───∞ ai_reports
          1───∞ portfolio (nullable link)
scan_runs 1───∞ scan_results ∞───1 companies
```

---

## `companies` — master security list
| column        | type          | notes                                        |
|---------------|---------------|----------------------------------------------|
| id            | BIGINT PK     |                                              |
| ticker        | TEXT UNIQUE   | indexed; normalized upper-case               |
| cik           | TEXT          | SEC Central Index Key (zero-padded), indexed |
| name          | TEXT          | company name                                 |
| exchange      | TEXT          | NYSE / NASDAQ / AMEX                          |
| sector        | TEXT          |                                              |
| industry      | TEXT          |                                              |
| market_cap    | NUMERIC       | last known, USD                              |
| currency      | TEXT          | default `USD`                                |
| is_active     | BOOLEAN       | delisted/invalid → false, excluded from scans|
| last_priced_at| TIMESTAMPTZ   | last successful price ingest                 |
| created_at / updated_at | TIMESTAMPTZ |                                     |

Seeded from SEC `company_tickers.json`; enriched with sector/industry via FMP/yfinance.

## `stock_prices` — daily OHLCV
| column     | type        | notes                                  |
|------------|-------------|----------------------------------------|
| id         | BIGINT PK   |                                        |
| company_id | FK→companies| indexed                                |
| ts         | DATE        | trading day                            |
| open, high, low, close, adj_close | NUMERIC |                       |
| volume     | BIGINT      |                                        |
| **unique** | (company_id, ts) | idempotent upserts                |
Index: `(company_id, ts DESC)` for fast latest-window reads.

## `financial_data` — fundamentals snapshot per period
| column            | type   | source            |
|-------------------|--------|-------------------|
| id                | BIGINT PK |                |
| company_id        | FK     |                   |
| period            | TEXT   | `annual`/`quarter`|
| fiscal_date       | DATE   | period end        |
| revenue           | NUMERIC|                   |
| revenue_growth    | NUMERIC| YoY, computed     |
| earnings          | NUMERIC| net income        |
| eps               | NUMERIC|                   |
| gross_margin      | NUMERIC|                   |
| operating_margin  | NUMERIC|                   |
| net_margin        | NUMERIC|                   |
| free_cash_flow    | NUMERIC|                   |
| fcf_growth        | NUMERIC| YoY, computed     |
| total_debt        | NUMERIC|                   |
| cash              | NUMERIC|                   |
| roic              | NUMERIC| computed          |
| roe               | NUMERIC|                   |
| valuation_metrics | JSONB  | pe, ps, pb, ev_ebitda, peg, fcf_yield… |
| source            | TEXT   | `fmp`/`sec_facts` |
| **unique**        | (company_id, period, fiscal_date) | |

## `sec_filings` — filing metadata + text
| column           | type   | notes                              |
|------------------|--------|------------------------------------|
| id               | BIGINT PK |                                 |
| company_id       | FK     |                                    |
| accession_no     | TEXT UNIQUE | SEC accession number          |
| filing_type      | TEXT   | 10-K / 10-Q / 8-K …                |
| filing_date      | DATE   |                                    |
| period_of_report | DATE   |                                    |
| url              | TEXT   | primary document URL               |
| filing_content   | TEXT   | extracted plain text (may be large)|
| summary          | TEXT   | GLM-generated summary (nullable)   |
| embedded         | BOOLEAN| chunks + vectors generated?        |
| created_at       | TIMESTAMPTZ |                               |

## `filing_chunks` — vector store for RAG
| column     | type            | notes                             |
|------------|-----------------|-----------------------------------|
| id         | BIGINT PK       |                                   |
| filing_id  | FK→sec_filings  | indexed                           |
| company_id | FK→companies    | denormalized for filtered search  |
| chunk_index| INT             | order within filing               |
| content    | TEXT            | chunk text (~1–2k chars)          |
| embedding  | VECTOR(EMBEDDING_DIM) | ivfflat/hnsw index for ANN  |
Index: `hnsw (embedding vector_cosine_ops)` for similarity search.

> Design note: the spec puts `embeddings` on `sec_filings`. Chunk-level vectors in a
> child table are the correct RAG pattern (a 10-K is far too long for one vector),
> so `sec_filings` keeps the text/summary and `filing_chunks` holds the vectors.

## `news_articles`
| column          | type   | notes                          |
|-----------------|--------|--------------------------------|
| id              | BIGINT PK |                             |
| company_id      | FK     |                                |
| headline        | TEXT   |                                |
| url             | TEXT   |                                |
| source          | TEXT   | GDELT / Finnhub                |
| published_at    | TIMESTAMPTZ |                           |
| sentiment_score | NUMERIC| -1..1 (GDELT tone / model)     |
| sentiment_label | TEXT   | positive/neutral/negative      |
| **unique**      | (company_id, url) |                     |
Index: `(company_id, published_at DESC)`.

## `technical_metrics` — one row per company per as-of date
| column     | type   | notes                                   |
|------------|--------|-----------------------------------------|
| id         | BIGINT PK |                                      |
| company_id | FK     |                                         |
| as_of      | DATE   |                                         |
| rsi        | NUMERIC| RSI(14)                                 |
| macd, macd_signal, macd_hist | NUMERIC |                       |
| sma_20, sma_50, sma_200 | NUMERIC |                            |
| ema_12, ema_26 | NUMERIC |                                     |
| bb_upper, bb_mid, bb_lower | NUMERIC | Bollinger(20,2)             |
| atr        | NUMERIC| ATR(14)                                 |
| volatility | NUMERIC| annualized stdev of returns             |
| momentum   | NUMERIC| e.g. 3/6/12-mo composite                |
| drawdown   | NUMERIC| current drawdown from trailing high     |
| trend_score| NUMERIC| 0-100 trend strength                    |
| extra      | JSONB  | avg_dollar_volume, 52w hi/lo, beta…     |
| **unique** | (company_id, as_of) |                            |

## `stock_scores` — composite ranking output
| column            | type   | 0-100 unless noted            |
|-------------------|--------|-------------------------------|
| id                | BIGINT PK |                            |
| company_id        | FK     |                               |
| as_of             | DATE   |                               |
| technical_score   | NUMERIC|                               |
| fundamental_score | NUMERIC|                               |
| growth_score      | NUMERIC|                               |
| value_score       | NUMERIC|                               |
| quality_score     | NUMERIC|                               |
| risk_score        | NUMERIC| higher = safer                |
| total_score       | NUMERIC| weighted composite            |
| rank              | INT    | 1 = best in the run           |
| recommendation    | TEXT   | Strong Buy/Buy/Hold/Watch/Avoid |
| breakdown         | JSONB  | per-factor detail for the UI  |
| scan_run_id       | FK→scan_runs (nullable) |             |
| **unique**        | (company_id, as_of) |               |
Index: `(as_of, total_score DESC)`.

## `ai_reports` — generated equity research
| column               | type   | notes                                |
|----------------------|--------|--------------------------------------|
| id                   | BIGINT PK |                                   |
| company_id           | FK     |                                      |
| model                | TEXT   | e.g. `z-ai/glm-5.2`                   |
| company_overview     | TEXT   |                                      |
| thesis               | TEXT   |                                      |
| bull_case            | TEXT   |                                      |
| bear_case            | TEXT   |                                      |
| catalysts            | JSONB  | list of {title, detail}              |
| risks                | JSONB  | list of {title, detail, severity}    |
| technical_analysis   | TEXT   |                                      |
| fundamental_analysis | TEXT   |                                      |
| recommendation       | TEXT   | Strong Buy/Buy/Hold/Watch/Avoid      |
| confidence           | INT    | 0-100                                |
| scores_snapshot      | JSONB  | the numeric context fed to the model |
| tokens_used          | INT    | for cost accounting                  |
| created_at           | TIMESTAMPTZ |                                 |
Index: `(company_id, created_at DESC)`. Latest report per company is the "current" one.

## `portfolio` — manual holdings (research/decision support)
| column         | type   | notes                          |
|----------------|--------|--------------------------------|
| id             | BIGINT PK |                             |
| ticker         | TEXT   |                                |
| company_id     | FK (nullable) |                         |
| shares         | NUMERIC|                                |
| entry_price    | NUMERIC|                                |
| entry_date     | DATE   |                                |
| thesis         | TEXT   |                                |
| current_status | TEXT   | open / watching / closed       |
| notes          | TEXT   |                                |
| created_at / updated_at | TIMESTAMPTZ |                   |

## `scan_runs` + `scan_results` — auditability of "Find Best Stocks"
`scan_runs`: id, status (queued/running/succeeded/failed), universe_size,
stage progress JSONB, params JSONB (filters/weights), counts per stage,
started_at, finished_at, error.

`scan_results`: id, scan_run_id FK, company_id FK, rank, total_score,
sub-scores snapshot JSONB, recommendation. `unique(scan_run_id, company_id)`.

---

## Indices & performance notes
- `stock_prices(company_id, ts DESC)` — windowed indicator computation.
- `stock_scores(as_of, total_score DESC)` — dashboard/scanner top-N.
- `filing_chunks` HNSW cosine index — semantic filing retrieval.
- `news_articles(company_id, published_at DESC)` — news timeline.
- Bulk price ingestion uses `INSERT … ON CONFLICT DO UPDATE` (upsert) keyed on
  the unique constraints above, so re-runs are idempotent.
