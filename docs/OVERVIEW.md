# Daddiesmoney — Full Overview

*What we've built · what it does · what I want to achieve · where it's going*

**Status:** Live on Railway · Repo: `DOMCHURCH/daddiesmoney` · Last updated: 2026‑07‑24

> **One line:** Daddiesmoney is an AI‑powered equity research terminal that scans the
> entire US stock market, ranks the best opportunities with transparent math, writes
> professional research on them, and emails me the exact moment to buy, take profit, or
> exit — with position sizing and a learning loop that gets sharper over time.
>
> **Honest framing up front:** This is a *decision‑support* tool, not a money printer.
> It does not place trades, it is not a way to turn $1k into $20k, and it does not copy
> Warren Buffett in real time. What it *is*: a disciplined system that finds good setups,
> sizes them so I don't blow up, and tells me when to act. The edge is consistency, not magic.

---

## Page 1 — What Daddiesmoney Is

### The problem it solves
There are ~6,000 US stocks. A human can't watch them all, can't stay unemotional, and
can't remember to sell at the right moment. Retail traders lose mostly to **three things**:
no edge, bad position sizing, and emotional timing. Daddiesmoney attacks all three:

- **Edge** → a deterministic scoring engine ranks the whole market on the same rules every time.
- **Sizing** → math (half‑Kelly + regime throttle) decides how much to put in, so one bad trade can't wreck the account.
- **Timing** → server‑side alerts email me *the moment* to enter, take profit at each target, or exit — I don't have to be watching.

### The two ways it's used
1. **On‑demand research ("Find Best Stocks").** I hit a button; it scans the market, ranks
   the top 100, and can write a full AI research report on any name.
2. **24/7 autonomous Market Watch.** A background loop scans during US market hours and
   emails me A+ setups the instant a strong stock dips into its buy zone — even when my
   browser is closed. This is the "Start Automation" switch, and it stays on across restarts.

### The core loop (what actually happens)
```
Scan the market → Score & rank → Pick the best setups → Size the position
   → Email me: BUY now → Email: SELL at Target 1 → Target 2 → time/exit
   → I log the trade → Track P&L vs my goal → Backtest learns → repeat, sharper
```

### What it does NOT do (important, honest)
- It **does not place trades.** It emails the plan; I execute at my own broker. The
  Positions page is a *manual* ledger of what I actually did.
- It **does not use leverage or options.** Pure buy/sell framing — no stop‑loss margin games.
- It **is not real‑time high‑frequency.** It works on daily/intraday setups, not millisecond scalping.

---

## Page 2 — How It Works Under the Hood

### The stack (deployed on Railway)
| Service | Tech | Job |
|---|---|---|
| `frontend` | Next.js 16 (App Router) | The terminal UI. Talks only to the API. |
| `backend` (`api`) | FastAPI (async) | REST endpoints, auth, reads the DB, runs jobs, streams progress. |
| `worker` | Celery (or in‑process runner on the lean deploy) | The scanner funnel, quant engine, AI report generation. |
| `postgres` | Postgres 16 + **pgvector** | System of record + vector store for SEC filing embeddings. |
| `redis` | Redis 7 | Job broker + cache + rate‑limit counters. |

> **Lean production build:** to fit a small Railway plan, it collapses to **Postgres +
> backend + frontend**. Redis and the separate Celery worker are replaced by an in‑process
> thread‑pool job runner, an in‑memory TTL cache, and Postgres‑persisted daily API budgets.

### Design principles (why it's trustworthy)
1. **Deterministic math, narrative AI.** *Every number* — indicators, ratios, scores — is
   computed by explicit code. The AI only reads filings/news and writes prose. **The AI
   never calculates a score.** No black‑box "the model says buy."
2. **Cheap‑before‑expensive funnel.** Free unlimited data (Yahoo) scans the whole market;
   expensive/rate‑limited APIs only touch the survivors.
3. **Cache everything.** Every external response is cached with sane TTLs; it never re‑hits
   an API for data it already holds.
4. **Idempotent, resumable jobs.** A scan records progress; re‑running skips finished work.

### The data providers
| Provider | Quota | Used for |
|---|---|---|
| yfinance (Yahoo) | unlimited | Bulk daily prices for the whole universe; all technicals |
| Financial Modeling Prep | 250/day | Income/balance/cash‑flow, ratios, valuation |
| SEC EDGAR + Company Facts | unlimited | 10‑K/10‑Q/8‑K text + structured XBRL fundamentals |
| Finnhub | 60/min | Earnings calendar & surprises, insider tx, analyst, news |
| GDELT | unlimited | News volume + tone/sentiment by company |
| Polygon/Massive | 5/min | Real‑time/intraday snapshots (used sparingly) |
| OpenRouter (**GLM‑5.2**) | budget‑limited | The AI equity‑research narrative |

### The scanner funnel ("Find Best Stocks")
```
[1] Universe          the tradable US stock list
[2] Bulk price scan   yfinance batch OHLCV (free, unlimited)  → full universe
[3] Technical score   0–100 on price action                   → ~1500 ranked survivors
[4] Enrichment        FMP + SEC + Finnhub on the top names     → deep fundamentals
[5] Full scoring      6 sub‑scores → weighted composite        → final rank
[6] Top 100           Rank · Ticker · Sector · Score · Recommendation
```

### The scoring engine — two layers
**Layer A — the 6‑factor investment scorecard** (for "is this a good company/stock?"):

| Sub‑score | Weight | Measures |
|---|---|---|
| Technical | 20% | price action, momentum, trend structure |
| Fundamental | 20% | profitability, margins, financial health |
| Growth | 20% | revenue/earnings growth |
| Value | 15% | valuation vs peers/history |
| Quality | 15% | balance‑sheet strength, consistency |
| Risk | 10% | volatility, drawdown, downside |

Missing factors are dropped and the weights renormalize — no fake precision.

**Layer B — the 14 trading strategies** (for "is this a good *trade right now*?"). Each
scores 0–100 and they're blended differently per time horizon:

`momentum · breakout · trend_following · pullback · mean_reversion · gap ·
volume_breakout · ma_crossover · volatility_expansion · support_resistance_break ·
relative_strength · earnings_momentum · news_momentum · sector_rotation`

**Horizon‑aware blends** (intraday → 1‑month each weight the strategies differently):

| Horizon | Leans on |
|---|---|
| Intraday | volume, breakout, volatility |
| 1–3 days | momentum + breakout |
| 1 week | momentum + trend |
| 2 weeks | trend + momentum + fundamentals |
| 1 month | trend + fundamentals |

---

## Page 3 — From Signal to Action

### Trade recommendations
For each qualifying name the engine produces a concrete plan: an **entry zone**, **Target 1**
and **Target 2** sell prices, a **time‑exit** (sell if it stalls past the window — no hard
stop‑loss, pure buy/sell framing), the **rationale**, and a **dollar allocation**.

### Position sizing (the part that keeps me alive)
- **Half‑Kelly sizing** — recommends a position size proportional to the statistical edge,
  halved for safety. This is the single most important defense against ruin.
- **Dynamic sizing** — scales the suggested dollars up/down with signal strength.
- **Macro regime throttle** — when the broad market regime is hostile, it automatically
  shrinks position sizes across the board. It trades small when the environment is bad.

### The alert system (AgentMail)
A background scheduler thread fires alerts server‑side, 24/7:
- **Time alerts** (BUY now, sell‑by‑the‑close, time‑exit) fire when their moment arrives.
- **Price alerts** (Target 1, Target 2) fire when the live price crosses the level.
- **Daily AI market brief** each weekday morning.
- **Advance position warnings** — heads‑up before earnings on an open position, and before
  high‑impact macro events (CPI, FOMC, jobs) that can move the whole market.

> **Just upgraded:** alerts now support **multiple recipients** — I can enter several
> emails (comma‑separated) in Settings and every alert goes to all of them, each person
> getting their own copy. The test button now surfaces the *real* send error instead of a
> generic failure, so delivery problems are diagnosable.

### The Positions page — my command center
- **Manual trade ledger** — log real buys/sells; it tracks realized & unrealized **P&L**.
- **Return‑goal tracker** — set a target (e.g. grow $1,000 by 20%) and watch progress.
- **"Your Edge" analytics** — win rate, average win vs loss, best strategies, expectancy.
- **Equity curve** — a zero‑dependency SVG chart of the account over time.
- **Position‑aware sell alerts** — alerts tuned to positions I actually hold.

### The learning loop (backtest → live weighting)
A backtest service replays ~1 year of history to measure which of the 14 strategies
actually had an edge. The winning weights are cached and **fed back into the live scorer**,
so scoring tilts toward the strategies that have proven themselves. Trigger it from
Settings → "Run backtest." This is what makes the system get sharper over time instead of
staying static.

### The full API surface (what the backend exposes)
`auth · dashboard · scanner · companies · portfolio · jobs · trades · active-trades ·
economic · alerts · ai · positions · automation · backtest · health`

---

## Page 4 — What I Want to Achieve

### The honest goals (grounded, not fantasy)
1. **Protect capital first.** Never blow up. The whole sizing/regime system exists for this.
2. **Grow a small account steadily.** Start with ~$1,000, learn the system with real (but
   survivable) money, and compound.
3. **Build toward income.** Longer‑term target of meaningful monthly cash flow (~$1,000/mo),
   understanding that in year 1 the *deposits* do most of the work, not the trading.

### The reality of the numbers (why patience wins)
- Turning **$1k into $20k** is a **20x (+1,900%)** return. Even *doubling* every single year
  — which almost nobody sustains — takes **4+ years**. At elite‑but‑realistic 20–30%/yr it's
  well over a decade. On a $1k base, a *great* year is ~+$300. The percentages are real; the
  dollars are small only because the base is small.
- The reliable path to five figures is **capital in + time + not blowing up**, not a heroic
  trade. Contributions plus modest compounding, e.g. ~$1k/month at ~12%/yr, reaches the tens
  of thousands over a few years — and *that's* when % returns start to rival the deposits.
- The app's sizing logic will actively **stop** the all‑in bets a fast 20x would require.
  That's a feature, not a limitation.

### What "success" actually looks like
- A **positive expectancy** shown in the Edge panel (average win × win‑rate beats average loss).
- An **equity curve that trends up** without stomach‑churning drawdowns.
- Me **acting on alerts with discipline** instead of emotion — buying the plan, selling the target.
- The **backtest confirming** the live strategies still have an edge, quarter after quarter.

### The risk I'm managing against
The single biggest danger isn't the market — it's the temptation to reach for leverage,
options, or "copy an anonymous crypto leaderboard trader" to force a fast 20x. That path is
gambling with better marketing, and it ends in $0 far more often than $20k. The system is
built to keep me on the boring, compounding, survivable path.

---

## Page 5 — The Roadmap & Bigger Vision

### Near‑term build (fits the app today)
1. **Superinvestor / 13F signal ("follow the smart money").**
   Pull **SEC EDGAR** (free) or **FMP/Quiver** data on what institutional managers (Berkshire
   etc.) hold, plus **Form 4 insider buys** (filed within ~2 days — much fresher). Surface it
   as a new input that *boosts* a ticker's score when respected funds are accumulating it.
   - *Honest caveat:* 13F is **quarterly and lagged up to 45 days**, long‑only. Great for
     buy‑and‑hold names like Buffett's (he barely trades); useless for fast traders. It's a
     slow conviction tilt, **not** real‑time copy‑trading.
2. **Alpaca paper‑trading execution ("auto‑place the trades it already emails").**
   Connect a US‑stock broker API (**Alpaca** — commission‑free, built for automation, has
   paper trading) so the app can actually *place* the buy/sell it currently only emails.
   - *Non‑negotiable guardrail:* this ships on **paper trading first**. Auto‑executing real
     money is a big jump in risk — a bug places real orders. Prove it on fake money, then graduate.

### Why the "copy‑trading APIs" I researched don't fit (and what does)
The MetaApi/CopyFactory, Duplikium, MetaCopier, Bitget/Bybit tools are real — but they copy
**MetaTrader forex signal providers** or **anonymous crypto leaderboard traders**, not
Buffett and not US stocks. There is no MetaTrader for US equities. For *this* app the honest
equivalent is: **EDGAR tells you *what* to buy · Alpaca/IBKR *places* it.** It's my own
decisions, executed — not mirroring a stranger.

### Longer‑term vision
- **Sharper learning loop** — expand the backtest to walk‑forward validation and per‑regime
  weighting, so the scorer adapts to bull vs bear conditions.
- **Broader research depth** — lean harder on the pgvector filing store for AI reports that
  cite specific 10‑K/10‑Q passages.
- **A real portfolio brain** — correlation‑aware sizing (don't hold five tickers that are
  secretly the same bet), sector exposure limits, drawdown circuit‑breakers.
- **Optional: multi‑market** — if I ever want crypto/forex, that's a *separate* app built on
  exchange APIs, with eyes open about the far higher risk.

### Guardrails that stay, no matter what
- **Paper before real.** Always.
- **Deterministic math, narrative AI.** The AI never sizes or scores.
- **No leverage, no options, pure buy/sell.**
- **Size for survival** (half‑Kelly + regime throttle) over chasing home runs.
- **No 20x fantasy.** Success is a rising equity curve and positive expectancy, compounded over years.

### Immediate next steps
1. Deploy the multi‑email + better‑error fix (already coded — needs commit/push).
2. Diagnose email delivery (check AgentMail key on Railway + spam folder via the new test error).
3. Decide first build: **13F signal** (free, fits today) or **Alpaca paper execution** (the real "auto" step).

---

## Appendix — Realistic Returns & Validation (evidence-based)

An external, heavily-sourced research review stress-tested this system against the academic
record. Its findings — and what we changed in response — are captured here so the reality
check lives in the repo.

**On returns.** 50%/yr sustained is a *fantasy anchor, not a plan.* The best quant fund ever
(Renaissance Medallion) did ~39%/yr net — with leverage, high-frequency execution, and a hard
capacity cap, and it returns only employee money. Documented factor edges run Sharpe ~0.3–0.6,
which unlevered is ~7–13%/yr. Retail day-traders lose net in aggregate; ~5% are reliably
profitable. **Defensible target: beat the market by a few points with controlled drawdown
(~10–20%/yr in favorable conditions), and treat any year over ~20% as luck-assisted, not
repeatable.** This is the same message as the goals above — now with the evidence behind it.

**The real edge of a small account is structural, not predictive.** A $1k account can fish in
illiquid microcaps and event-driven niches that large funds literally cannot touch. Highest-ROI,
*free* signals to exploit that (roadmap Stage 1):
- **Lazy Prices** — 10‑K/10‑Q text‑change detection from SEC EDGAR (~22%/yr in‑sample; free).
- **Opportunistic insider clusters** — non‑routine Form 4 cluster buys (fresher than 13F).
- **Low short‑interest tilt** — free from FINRA.
- **Analyst‑revision momentum.**

**Verified against the actual code — real liabilities vs. already-handled:**

| Concern raised | Status in the code |
|---|---|
| 1‑yr in‑sample backtest fed weights straight to the live scorer | **Was true → now fixed** (train/test split + out‑of‑sample shrink) |
| Half‑Kelly sizing | **Was true → now quarter‑Kelly** (≥50% drawdown risk cut from ~12.5% to <0.8%) |
| Survivorship bias (yfinance omits delisted tickers) | Real — fix with delisting‑inclusive data (Stage 3, e.g. Sharadar) |
| Non‑point‑in‑time fundamentals (look‑ahead bias) | Real — fix with PIT fundamentals (Stage 3) |
| "Fitted HMM regime is fragile out‑of‑sample" | **N/A** — already uses simple 200/50‑day MA + an economic regime score, exactly as recommended |
| "No liquidity floor / correlation penalty" | **Already present** — 2% ADV position cap + a correlation penalty in `allocation.py` |

**Changes made in response (shipped in code):**
1. **Quarter‑Kelly sizing** (was half‑Kelly), capped at 15% of capital — sized for survival.
2. **Out‑of‑sample backtest validation** — the 14‑strategy weights now train on the earlier
   ~70% of history and are validated on a held‑out later ~30% (with an embargo gap). Each
   weight only deviates from neutral by the *fraction of its edge that survived out‑of‑sample*,
   so pure in‑sample curve‑fitting no longer reaches the live scorer.

**The bar before real money (roadmap Stage 5):** 2–3 years of walk‑forward / out‑of‑sample the
model never saw, 6–12 months of honest paper trading on Alpaca reconciled against the backtest,
a positive **Deflated Sharpe** across all 14 strategies (a naive t≈2 isn't enough after testing
dozens of configs), and *hundreds* — not dozens — of trades before trusting the win rate. Fund a
**non‑registered** account, not the TFSA — frequent trading risks CRA business‑income
reclassification even inside a TFSA (*Ahamed v. The King*, 2023 TCC 17). Consult a CPA.

---

*Daddiesmoney is a discipline engine wearing a trading terminal. The goal was never to get
rich quick — it's to remove the three things that sink retail traders (no edge, bad sizing,
emotional timing) and let consistency compound.*
