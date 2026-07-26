// Bounded, cached, multi-provider price lookup shared by the API routes.
//
// Why this module exists: Yahoo's chart endpoint takes the symbol in the URL
// path, so it needs one request per ticker — it can't batch the way its quote
// endpoint can. Yahoo throttles that volume from a datacenter IP by *hanging*
// the request rather than returning an error, so an unbounded `fetch` doesn't
// fail fast: it burns the whole serverless budget and the caller gets nothing
// back, not even the parts of the response that never needed a price.
//
// So: every fetch here is bounded, every result (including "no data") is
// cached, a provider that starts hanging is tripped out of rotation for a
// cooldown instead of being retried, and callers are told which provider
// answered so a degraded price can be reported honestly instead of silently
// looking like a real one.
//
// Provider order is by cost of being throttled, not by preference: a keyed
// batch endpoint answers N symbols in 1 request and has a published rate limit,
// so it's used first when a key exists. Yahoo stays the zero-config default.
//   FMP_API_KEY      → 1 request per batch (financialmodelingprep.com)
//   POLYGON_API_KEY  → 1 request per batch (api.polygon.io snapshot)
//   (no key)         → Yahoo, per symbol, concurrency-capped

const QUOTE_TTL = 60 * 1000 // live price — a landing page doesn't need tick accuracy
const MISS_TTL = 5 * 60 * 1000 // cache "no data" too, so a bad/delisted symbol can't stampede
const CACHE_MAX = 2000

// A provider that fails this many times in a row is presumed throttled and
// skipped entirely until the cooldown expires. Yahoo's penalty for hammering a
// datacenter IP outlives any single request, so retrying inside the block just
// spends the caller's time to arrive at the same answer.
const BREAKER_THRESHOLD = 3
const BREAKER_COOLDOWN = 10 * 60 * 1000

// Yahoo hangs rather than erroring, so its bound is the only thing that ends
// the request. Keep it well under the caller's own budget.
const YAHOO_TIMEOUT = 3500
const KEYED_TIMEOUT = 5000
const YAHOO_CONCURRENCY = 4

// Module-level so both survive warm serverless invocations (same pattern as the
// SEC ticker map in edgar.js). A cold start just re-earns them.
const _cache = new Map() // SYM -> { quote, at }
const _breakers = new Map() // provider -> { fails, until }

function cacheGet(sym) {
  const hit = _cache.get(sym)
  if (!hit) return undefined
  const ttl = hit.quote ? QUOTE_TTL : MISS_TTL
  if (Date.now() - hit.at > ttl) {
    _cache.delete(sym)
    return undefined
  }
  return hit.quote
}

function cacheSet(sym, quote) {
  // Bound the map so a long-lived warm instance can't grow it without limit.
  if (_cache.size >= CACHE_MAX) {
    for (const k of _cache.keys()) {
      _cache.delete(k)
      if (_cache.size < CACHE_MAX * 0.9) break
    }
  }
  _cache.set(sym, { quote, at: Date.now() })
}

function breakerOpen(provider) {
  const b = _breakers.get(provider)
  return !!(b && b.until > Date.now())
}

function recordFailure(provider) {
  const b = _breakers.get(provider) || { fails: 0, until: 0 }
  b.fails += 1
  if (b.fails >= BREAKER_THRESHOLD) b.until = Date.now() + BREAKER_COOLDOWN
  _breakers.set(provider, b)
}

function recordSuccess(provider) {
  _breakers.delete(provider)
}

/** fetch that always terminates — a hung socket aborts instead of stalling the function. */
async function boundedFetch(url, { timeoutMs, headers } = {}) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    return await fetch(url, { headers, signal: ctl.signal })
  } finally {
    clearTimeout(timer)
  }
}

function quote(sym, price, prevClose, extra = {}) {
  if (price == null || !Number.isFinite(price)) return null
  const chg = prevClose != null && Number.isFinite(prevClose) && prevClose !== 0
    ? ((price - prevClose) / prevClose) * 100
    : null
  return { sym, price, chg, ...extra }
}

// ── Providers ────────────────────────────────────────────────────────────────
// Each returns a Map of SYM -> quote for whatever it could resolve, or throws.
// Symbols a provider simply doesn't cover are omitted, not thrown — that's a
// miss to pass down the chain, not a provider failure.

async function fromFMP(syms) {
  const key = process.env.FMP_API_KEY
  const url = `https://financialmodelingprep.com/api/v3/quote/${syms.join(',')}?apikey=${encodeURIComponent(key)}`
  const r = await boundedFetch(url, { timeoutMs: KEYED_TIMEOUT })
  if (!r.ok) throw new Error(`FMP ${r.status}`)
  const rows = await r.json()
  if (!Array.isArray(rows)) throw new Error('FMP: unexpected payload')
  const out = new Map()
  for (const row of rows) {
    const sym = String(row?.symbol || '').toUpperCase()
    if (!sym) continue
    const q = quote(sym, row.price, row.previousClose, {
      marketCap: row.marketCap ?? null,
      sharesOutstanding: row.sharesOutstanding ?? null,
    })
    if (q) out.set(sym, q)
  }
  return out
}

async function fromPolygon(syms) {
  const key = process.env.POLYGON_API_KEY
  const url = 'https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers'
    + `?tickers=${syms.join(',')}&apiKey=${encodeURIComponent(key)}`
  const r = await boundedFetch(url, { timeoutMs: KEYED_TIMEOUT })
  if (!r.ok) throw new Error(`Polygon ${r.status}`)
  const data = await r.json()
  const rows = data?.tickers
  if (!Array.isArray(rows)) throw new Error('Polygon: unexpected payload')
  const out = new Map()
  for (const row of rows) {
    const sym = String(row?.ticker || '').toUpperCase()
    if (!sym) continue
    const day = row.day || {}
    const prev = row.prevDay || {}
    // `day.c` is 0 before the session opens; last trade is the live figure.
    const price = row.lastTrade?.p ?? (day.c || null) ?? prev.c
    const q = quote(sym, price, prev.c)
    if (q) out.set(sym, q)
  }
  return out
}

async function fromYahoo(syms) {
  const out = new Map()
  let hung = 0
  // Concurrency-capped: the throttle is triggered by request *rate* from one
  // IP, so firing all symbols at once is what provokes the hang in the first
  // place. A small pool keeps a warm instance under Yahoo's tolerance.
  const queue = [...syms]
  const workers = Array.from({ length: Math.min(YAHOO_CONCURRENCY, queue.length) }, async () => {
    while (queue.length) {
      const sym = queue.shift()
      try {
        const r = await boundedFetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=2d`,
          { timeoutMs: YAHOO_TIMEOUT, headers: { 'User-Agent': 'Mozilla/5.0' } }
        )
        if (r.status === 429) { hung++; continue }
        if (!r.ok) continue // 404 on a bad symbol is a miss, not a throttle
        const d = await r.json()
        const meta = d?.chart?.result?.[0]?.meta
        if (!meta) continue
        const q = quote(sym, meta.regularMarketPrice, meta.chartPreviousClose ?? meta.previousClose)
        if (q) out.set(sym, q)
      } catch {
        // AbortError (the hang we're guarding against) or a transport error.
        hung++
      }
    }
  })
  await Promise.all(workers)
  // Nothing came back and requests were hanging — that's the throttle signature,
  // not a batch of bad tickers. Surface it so the breaker can trip.
  if (out.size === 0 && hung > 0) throw new Error(`Yahoo unresponsive (${hung} bounded out)`)
  return out
}

function providerChain() {
  const chain = []
  if (process.env.FMP_API_KEY) chain.push({ name: 'fmp', fn: fromFMP })
  if (process.env.POLYGON_API_KEY) chain.push({ name: 'polygon', fn: fromPolygon })
  chain.push({ name: 'yahoo', fn: fromYahoo })
  return chain
}

/**
 * Resolve quotes for a list of symbols.
 *
 * Never throws and never hangs: on total failure it returns null-priced entries
 * plus `degraded: true` and a reason, so a caller can say "price unavailable"
 * instead of rendering a fabricated or stale-looking number.
 *
 * @returns {{ quotes: object[], sources: string[], degraded: boolean, reason: string|null }}
 */
export async function getQuotes(symbols) {
  const syms = [...new Set(symbols.map(s => String(s).trim().toUpperCase()).filter(Boolean))]
  if (!syms.length) return { quotes: [], sources: [], degraded: false, reason: null }

  const resolved = new Map()
  const sources = []
  const failures = []

  // Cache first — a hit costs no provider budget and can't be throttled.
  const pending = []
  for (const sym of syms) {
    const hit = cacheGet(sym)
    if (hit === undefined) pending.push(sym)
    else if (hit) { resolved.set(sym, hit); if (!sources.includes('cache')) sources.push('cache') }
  }

  for (const { name, fn } of providerChain()) {
    const missing = pending.filter(s => !resolved.has(s))
    if (!missing.length) break
    if (breakerOpen(name)) {
      failures.push(`${name}: skipped (cooling down after repeated timeouts)`)
      continue
    }
    try {
      const got = await fn(missing)
      recordSuccess(name)
      if (got.size) {
        for (const [sym, q] of got) resolved.set(sym, q)
        sources.push(name)
      }
    } catch (err) {
      recordFailure(name)
      failures.push(`${name}: ${err.message}`)
    }
  }

  // Cache successes, and cache misses that every provider agreed on, so a
  // symbol nobody covers doesn't re-run the whole chain on the next request.
  for (const sym of pending) cacheSet(sym, resolved.get(sym) || null)

  const quotes = syms.map(sym => resolved.get(sym) || { sym, price: null, chg: null })
  const degraded = quotes.some(q => q.price == null)
  return {
    quotes,
    sources,
    degraded,
    reason: degraded && failures.length ? failures.join('; ') : null,
  }
}

/** Single-symbol convenience wrapper. Returns null when no provider could answer. */
export async function getQuote(symbol) {
  const { quotes, sources, reason } = await getQuotes([symbol])
  const q = quotes[0]
  if (!q || q.price == null) return { quote: null, source: null, reason }
  return { quote: q, source: sources[0] || null, reason: null }
}
