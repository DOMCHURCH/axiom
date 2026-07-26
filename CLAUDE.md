# AXIOM — Equity Research Platform

## What this is
AXIOM is a BYOK (Bring Your Own Key) institutional-grade equity research generator. Users supply their own AI API key; AXIOM fetches real SEC EDGAR filings, runs a two-pass AI analysis, and outputs a full research note: DCF model, comps table, bull/bear thesis, risk matrix, investment recommendation.
Zero inference cost to the platform. No user data stored server-side. Keys stay in localStorage.

## Stack
- **Frontend:** React 18 + Vite (no framework router — single page)
- **Serverless API:** Vercel functions in `/api/` (same pattern as Dwelling)
- **Data:** SEC EDGAR public API (free, no key needed)
- **AI:** Provider-agnostic BYOK proxy — Cerebras, Groq, OpenRouter, Anthropic, OpenAI
- **Deployment:** Vercel

## File structure
```
axiom/
├── api/
│   ├── ai.js          # BYOK proxy — routes key to correct provider
│   └── edgar.js       # SEC EDGAR fetcher — ticker → CIK → financials
├── src/
│   ├── App.jsx
│   ├── main.jsx
│   ├── components/
│   │   ├── ApiKeyModal.jsx
│   │   └── ResearchReport.jsx
│   └── lib/
│       ├── ai.js      # Two-pass generateResearch()
│       ├── dcf.js     # DCF engine + fmt/pct helpers
│       └── storage.js # localStorage: key, history, provider detection
├── index.html
├── vite.config.js
├── vercel.json
└── package.json
```

## BYOK provider detection
- `csk-` → Cerebras → `llama-4-scout-17b-16e-instruct`
- `gsk_` → Groq → `llama-3.3-70b-versatile`
- `sk-or-` → OpenRouter → `meta-llama/llama-3.3-70b-instruct`
- `sk-ant-` → Anthropic → `claude-3-5-haiku-20241022`
- `sk-` → OpenAI → `gpt-4o-mini`

## Price data (`api/_prices.js`)
Yahoo's chart endpoint takes the symbol in the **URL path**, so it needs one request
per ticker — it can't batch like its quote endpoint. Under load from a datacenter IP
Yahoo throttles by **hanging** the request rather than erroring, so an unbounded
`fetch` doesn't fail fast: it burns the whole function budget and returns nothing.

`_prices.js` is the single price path for `api/quotes.js` and `api/edgar.js`:
- **Bounded** — every fetch has an `AbortController` timeout (Yahoo 3.5s, keyed 5s), so a hang degrades instead of stalling the caller
- **Cached** — 60s per symbol in module memory (survives warm invocations); misses cached 5min so a bad symbol can't stampede
- **Circuit-broken** — 3 consecutive hangs trips a provider out of rotation for 10min instead of re-hammering an IP that's already penalised
- **Honest** — callers get `sources` / `degraded` / `reason`; `financials.priceSource` is `null` when nothing answered, so a price-less report is labelled, never faked

Provider order is by cost of being throttled, so setting a key **switches off Yahoo**
automatically — no code change:
| Env var | Provider | Requests per batch |
|---|---|---|
| `FMP_API_KEY` | Financial Modeling Prep | 1 |
| `POLYGON_API_KEY` | Polygon snapshot | 1 |
| *(none)* | Yahoo — zero-config default | 1 per symbol, capped at 4 concurrent |

## Two-pass AI analysis
1. Pass 1 — Chain-of-thought: IB analyst reasons through the investment case
2. Pass 2 — Structured JSON extraction: recommendation, DCF assumptions, comps, risks, thesis

## Design language
- Background: `#0a0a0a`, Panels: `#111`
- Accent: `#38bdf8`, Positive: `#22c55e`, Negative: `#f87171`
- Fonts: IBM Plex Mono (labels/data), Inter (body)
- All styles inline React — no CSS framework

## Report sections
Header → Executive Summary → Investment Thesis → Financial Highlights → Bull/Bear → DCF Model → Comps Table → Key Risks → Analyst Note

## Git
Branch: `main`
Author: Dominique C <01dominique.c@gmail.com>
