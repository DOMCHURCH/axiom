# Deployment — Railway (lean, 3 services)

Everything runs on Railway in **one project** with **3 services**:

| Service    | Source dir | Build      | Start command                  | Notes |
|------------|-----------|------------|--------------------------------|-------|
| `Postgres` | plugin    | pgvector   | (managed)                      | needs `CREATE EXTENSION vector` |
| `backend`  | `backend/`| Dockerfile | `bash scripts/start_api.sh`    | FastAPI + in-process job runner |
| `frontend` | `frontend/`| Dockerfile| (Dockerfile CMD)               | Next.js terminal UI |

No Redis, no separate worker: scans/reports run as background threads inside the
`backend` process (progress tracked in Postgres), caching is in-memory, and daily
API budgets are persisted in Postgres so they survive restarts.

> **Everything must be in the SAME Railway project** — that's how the services share
> `${{...}}` variables and reach each other over the private network.

---

## 1. Postgres + pgvector

Add the **Postgres** plugin. Open its **Data / Query** tab and run once:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```
("Query returned no rows" = success.) If it errors that `vector` is unavailable,
deploy a service from the image `pgvector/pgvector:pg16` instead (set
`POSTGRES_PASSWORD`, `POSTGRES_DB=daddiesmoney`, a volume at
`/var/lib/postgresql/data`) and use its connection URL as `DATABASE_URL`.

The first migration enables the extension and builds the whole schema on boot.

---

## 2. Deploy `backend`

**+ New → GitHub Repo → `DOMCHURCH/daddiesmoney`**. Then in the service **Settings**:
- **Root Directory:** `backend`
- **Deploy → Custom Start Command:** `bash scripts/start_api.sh`
- **Networking → Health Check Path:** `/api/v1/health`
- Name it **`backend`** (or `api`) — remember the name for the frontend's `BACKEND_URL`.

---

## 3. Deploy `frontend`

**+ New → GitHub Repo → `DOMCHURCH/daddiesmoney`**. Then **Settings**:
- **Root Directory:** `frontend`
- **Networking → Generate Domain** — this URL *is* your app.

---

## 4. Environment variables

**`backend`** (Variables → Raw Editor):
```
DATABASE_URL=${{Postgres.DATABASE_URL}}
APP_TOKEN=<a long random secret>
OPENROUTER_API_KEY=<your key>
OPENROUTER_MODEL=z-ai/glm-5.2
FMP_API_KEY=<your key>
FINNHUB_API_KEY=<your key>
POLYGON_API_KEY=<your key>
SEC_USER_AGENT=Daddiesmoney Research your_email@example.com
ENV=production
PORT=8000
```
> `${{Postgres.DATABASE_URL}}` assumes the DB service is named `Postgres`; adjust if not,
> or paste the raw URL from the DB's Connect tab.

**`frontend`**:
```
BACKEND_URL=http://backend.railway.internal:8000
NODE_ENV=production
```
> Use the backend service's exact name in the internal host. Since `PORT=8000` on the
> backend, the internal URL is `:8000`.

The embedding model (`fastembed` bge-small, ~130 MB) downloads on the first AI report
and is cached thereafter. No key needed.

---

## 5. Migrations & first data
- **Migrations** run automatically when `backend` boots (`start_api.sh`).
- **Universe seeding is automatic**: the first **Find Best Stocks** run loads the US
  universe from SEC when the DB is empty, so the first scan is slower. Set the
  **Universe cap** to ~200 in the Scanner for a quick first run.

---

## 6. Verify
1. `GET https://<frontend-domain>` → login screen. Enter your `APP_TOKEN`.
2. (Optional) generate a domain for `backend` and hit `/api/v1/health` → `{"status":"ok","db":true}`.
3. Scanner → Universe cap `200` → **Find Best Stocks** → watch progress → results fill in.
4. Open a top result → **Generate** the AI report.

---

## 7. Troubleshooting
- **`type "vector" does not exist`** → the Postgres image lacks pgvector; use the
  `pgvector/pgvector:pg16` image path in §1.
- **Frontend 502 on API calls** → `BACKEND_URL` wrong; confirm it matches the backend
  service name + `:8000`, and that the backend has `PORT=8000`.
- **Scan finds few fundamentals** → FMP's 250/day budget is spent (tracked in the
  `provider_usage` table); survivors fall back to free SEC Company Facts and the cache
  fills over subsequent days. By design.
- **AI report empty / `finish=length`** → GLM-5.2 is a reasoning model; the report call
  already uses `max_tokens=8000`. Don't lower it.
- **A long scan stopped after a redeploy** → background jobs live in the backend process;
  a redeploy restarts it. Just run the scan again (it's idempotent and reuses cached data).

---

## 8. CLI alternative
```bash
npm i -g @railway/cli && railway login && railway link
railway up --service backend     # from repo root; repeat for frontend
railway variables set KEY=value --service backend
```
