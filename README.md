# AXIOM — Best Stocks of the Day

AXIOM scans the US equity market, ranks the **best stocks of the day** across six
factors — technical · fundamental · growth · value · quality · risk — and writes a
deep AI research note on each. Click any ranked name to see its **price graph**,
factor scorecard, fundamentals, and a full AI analysis (thesis, bull/bear,
catalysts, risk matrix, recommendation + confidence).

- **No login.** Bring one **OpenRouter** key and AXIOM runs a cheap **DeepSeek**
  model for the narrative. All math is computed in Python — the AI only interprets.
- **Research, not trading.** Decision-support only; no order execution.

## Stack
Frontend: React 18 + Vite + `lightweight-charts`. Backend: Python FastAPI +
Postgres/pgvector. AI: OpenRouter · DeepSeek. Data: Yahoo, FMP, SEC EDGAR, Finnhub,
GDELT, FRED.

## Quickstart
```bash
# 1. Postgres
docker compose up -d

# 2. Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # set OPENROUTER_API_KEY (required) + FMP_API_KEY
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev                     # http://localhost:5173  (proxies /api → :8000)
```
Open the app and hit **Find Best Stocks**.

## Deploy (Railway — one project, 3 services)
- **Postgres** — add the PostgreSQL database (pgvector is enabled by the first migration).
- **Backend** — service with root dir **`backend`** (its Dockerfile). Start command:
  `alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Set
  `OPENROUTER_API_KEY`, `FMP_API_KEY`, `DATABASE_URL=${{Postgres.DATABASE_URL}}`.
- **Frontend** — service with root dir **`frontend`**, build `npm install && npm run build`,
  start `npx serve -s dist -l $PORT`, and `VITE_API_URL=<backend URL>`.
  (Or deploy `frontend/` to Vercel with the same `VITE_API_URL`.)

## Configuration
The only key you *need* is `OPENROUTER_API_KEY`. `FMP_API_KEY` unlocks richer
fundamentals. Everything else (Finnhub, Polygon, FRED) is optional. See
`backend/.env.example`. Leave `APP_TOKEN` empty to keep the API open (default);
set it to re-enable single-user token protection.

## Docs
`docs/ARCHITECTURE.md` · `docs/API.md` · `docs/DATABASE.md` · `docs/DEPLOYMENT.md`
