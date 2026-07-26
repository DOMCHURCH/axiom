// AXIOM API client — talks to the FastAPI research backend.
//
// Base URL resolution:
//   • VITE_API_URL (e.g. https://axiom-api.up.railway.app) in production
//   • otherwise same-origin "/api/v1" (the Vite dev proxy forwards to :8000)
const RAW_BASE = import.meta.env.VITE_API_URL || ''
export const API_BASE = `${RAW_BASE.replace(/\/$/, '')}/api/v1`

async function req(path, { method = 'GET', body, signal } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  })
  let data = null
  try { data = await res.json() } catch { /* empty body */ }
  if (!res.ok) {
    const msg = data?.detail || data?.error?.message || data?.error || `Request failed (${res.status})`
    const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
    err.status = res.status
    throw err
  }
  return data
}

// ── Scanner ("Find Best Stocks") ──
export const runScan = (params = {}) => req('/scanner/run', { method: 'POST', body: params })
export const getJob = (jobId) => req(`/jobs/${jobId}`)
export const scanResults = (runId, { limit = 100, sort = 'rank' } = {}) =>
  req(`/scanner/results/${runId}?limit=${limit}&sort=${sort}`)
export const latestResults = ({ limit = 100 } = {}) => req(`/scanner/latest?limit=${limit}`)

// Which backend build is live (commit/branch/scan settings) — makes a stale
// deploy obvious instead of something to infer from UI symptoms.
export const health = () => req('/health')

// ── Market / dashboard ──
export const marketOverview = () => req('/market/overview')
export const marketTop = (limit = 15) => req(`/market/top?limit=${limit}`)

// ── Company / research detail ──
export const company = (t) => req(`/companies/${t}`)
export const prices = (t, range = '1Y') => req(`/companies/${t}/prices?range=${range}`)
export const technicals = (t) => req(`/companies/${t}/technicals`)
export const fundamentals = (t) => req(`/companies/${t}/fundamentals`)
export const news = (t, limit = 12) => req(`/companies/${t}/news?limit=${limit}`)
export const valuation = (t) => req(`/companies/${t}/valuation`)
export const getReport = (t) => req(`/companies/${t}/report`)
export const makeReport = (t) => req(`/companies/${t}/report`, { method: 'POST' })

// ── Job polling helper ──
// Polls a job until it succeeds/fails. Calls onProgress({...job, elapsed}) on
// updates. A full-market scan legitimately runs for several minutes, so the
// timeout is generous and transient poll failures (a cold DB, a redeploy, a
// dropped request) are tolerated instead of aborting a scan that's still running.
export async function pollJob(jobId, {
  onProgress, interval = 2000, timeout = 2_700_000, maxConsecutiveErrors = 8,
} = {}) {
  const start = Date.now()
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  let errors = 0
  while (Date.now() - start < timeout) {
    try {
      const job = await getJob(jobId)
      errors = 0
      onProgress?.({ ...job, elapsed: Math.round((Date.now() - start) / 1000) })
      if (job.status === 'succeeded') return job
      if (job.status === 'failed') throw new Error(job.error || 'Scan failed')
    } catch (err) {
      if (err.message === 'Scan failed' || err.status === 404) throw err
      if (++errors >= maxConsecutiveErrors) throw err
    }
    await wait(interval)
  }
  throw new Error('Scan timed out — the backend may still be running; hit refresh to load results.')
}

// ── Formatting helpers ──
export const fmtMoney = (v) => {
  if (v == null || !isFinite(v)) return '—'
  const abs = Math.abs(v)
  if (abs >= 1e12) return `$${(v / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(1)}K`
  return `$${v.toFixed(2)}`
}
export const fmtPct = (v, digits = 1) =>
  v == null || !isFinite(v) ? '—' : `${(v * 100).toFixed(digits)}%`
export const fmtNum = (v, digits = 2) =>
  v == null || !isFinite(v) ? '—' : Number(v).toFixed(digits)

// Recommendation → color (matches the report token palette)
export const REC_COLOR = {
  'Strong Buy': '#22c55e',
  Buy: '#4ade80',
  Hold: '#f59e0b',
  Watch: '#94a3b8',
  Avoid: '#f87171',
}
// Score (0-100) → color ramp
export const scoreColor = (s) => {
  if (s == null) return '#475569'
  if (s >= 80) return '#22c55e'
  if (s >= 68) return '#4ade80'
  if (s >= 52) return '#f5a524'
  if (s >= 38) return '#f59e0b'
  return '#f87171'
}
