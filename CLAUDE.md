# AXIOM — Best Stocks of the Day

## What this is
AXIOM scans the US equity market, ranks the **best stocks of the day** across six
factors (technical · fundamental · growth · value · quality · risk), and generates
a deep AI research note on each name. Click any ranked stock to see its price
graph, factor scorecard, fundamentals, and a full AI analysis (thesis, bull/bear,
catalysts, risk matrix, recommendation + confidence).

There is **no login**. You bring one key — an **OpenRouter** key — and AXIOM runs a
cheap **DeepSeek** model for the narrative. All the math is done in Python; the AI
only interprets numbers it's given (it never invents figures).

## Stack
- **Frontend:** React 18 + Vite + react-router-dom (single-page, deploys static)
  - Price chart: TradingView `lightweight-charts`
  - All styling inline React from shared design tokens (`src/lib/tokens.js`)
- **Backend:** Python FastAPI (async) + in-process background job runner  → `backend/`
- **Data store:** Postgres 16 + pgvector
- **AI:** OpenRouter · DeepSeek (`deepseek/deepseek-chat` by default; narrative only)
- **Deploy:** Frontend on Vercel (static) · Backend + Postgres on Railway

## Data sources
Yahoo Finance (prices, unlimited) · Financial Modeling Prep (fundamentals, 250/day
free) · SEC EDGAR (filings, unlimited) · Finnhub / GDELT (news & sentiment) ·
Polygon (optional real-time) · FRED (optional macro). Only OpenRouter + FMP keys
are needed to get full value; everything else is optional/free.

## The scanner funnel ("Find Best Stocks")
`universe → bulk Yahoo prices → liquidity gate → technical rank →
staged FMP/SEC fundamental enrichment → six-factor composite score → rank → top-N`
Cheap unlimited data filters the whole universe; only the strongest technical
candidates consume the rate-limited fundamental APIs. See `docs/ARCHITECTURE.md` §5.

## Scoring (deterministic, in Python — `backend/app/quant/scoring.py`)
Six 0–100 sub-scores + a weighted composite → recommendation
(`Strong Buy / Buy / Hold / Watch / Avoid`). Risk is inverted (higher = safer).

## File structure
```
axiom/
├── backend/                 # FastAPI research engine (the scanner + AI)
│   ├── app/
│   │   ├── api/routes/       # scanner, companies, dashboard, jobs, …
│   │   ├── quant/            # scoring, technical, fundamental (all math)
│   │   ├── data/             # yahoo, fmp, sec, finnhub, fred, polygon
│   │   ├── ai/               # openrouter client + research prompt
│   │   ├── services/         # scanner funnel, ingest, report
│   │   ├── worker/           # in-process job runner
│   │   ├── db/ · config.py · main.py
│   ├── Dockerfile · requirements.txt · .env.example
├── frontend/                # React frontend (its own Railway/Vercel service)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── BestStocks.jsx    # home: Find Best Stocks → ranked list
│   │   │   └── StockDetail.jsx   # chart + scorecard + fundamentals + AI note
│   │   ├── components/           # PriceChart, ReportView, ui, Shell, charts
│   │   ├── lib/api.js            # backend client + job polling + formatters
│   │   └── lib/tokens.js         # design system
│   ├── index.html · vite.config.js · vercel.json · package.json
├── docs/                    # ARCHITECTURE / API / DATABASE / DEPLOYMENT
└── docker-compose.yml       # local Postgres (pgvector)
```

## Key API endpoints (base `/api/v1`)
- `POST /scanner/run` → `{job_id, scan_run_id}`; poll `GET /jobs/{id}`
- `GET /scanner/results/{run_id}` · `GET /scanner/latest` → ranked results
- `GET /companies/{ticker}` (profile+scores) · `/prices` (candles) · `/fundamentals`
  · `/technicals` · `GET|POST /report` (AI note)
- `GET /market/overview` · `GET /market/top`

## Design language
- App shell: bg `#050810`, panels `#0d1228`, accent cyan `#0ea5e9`
- Report surface: navy panels, recessed inner cards, accent `#38bdf8`
- Positive `#22c55e` · Negative `#f87171` · Fonts IBM Plex Mono (data) + Inter (body)

## Run locally
```bash
# backend
docker compose up -d                         # Postgres (pgvector)
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                          # set OPENROUTER_API_KEY + FMP_API_KEY
alembic upgrade head
uvicorn app.main:app --reload --port 8000
# frontend (new terminal)
cd frontend && npm install && npm run dev      # Vite proxies /api → :8000
```

## Deploy (Railway — 3 services in one project)
- **Postgres** — add the PostgreSQL database (pgvector enabled by migration 0001).
- **Backend** — service with **root dir `backend`** (uses its Dockerfile). Start cmd
  `alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Set
  `OPENROUTER_API_KEY` (required), `FMP_API_KEY`, `DATABASE_URL=${{Postgres.DATABASE_URL}}`.
- **Frontend** — service with **root dir `frontend`**, build `npm install && npm run build`,
  start `npx serve -s dist -l $PORT`, var `VITE_API_URL=<backend URL>`.
  (Or deploy `frontend/` to Vercel with the same `VITE_API_URL`.)

## Git
Branch: `main`
Author: Dominique C <01dominique.c@gmail.com>
