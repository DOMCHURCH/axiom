import { neon } from '@neondatabase/serverless'
import { randomBytes } from 'node:crypto'

const sql = neon(process.env.DATABASE_URL)

// Neon free-tier compute auto-suspends after inactivity. The first query against
// a suspended instance can fail while it wakes (~a few hundred ms). Retry a few
// times with backoff so a cold start is transparent instead of a 503.
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function withRetry(fn, attempts = 4) {
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      // Only retry transient connection/availability errors — not SQL errors.
      const msg = String(err?.message || err).toLowerCase()
      const transient = msg.includes('fetch') || msg.includes('connect') ||
        msg.includes('timeout') || msg.includes('terminat') ||
        msg.includes('econnreset') || msg.includes('503') || msg.includes('502') ||
        msg.includes('network') || msg.includes('unavailable')
      if (!transient || i === attempts - 1) throw err
      await sleep(250 * Math.pow(2, i)) // 250ms, 500ms, 1s
    }
  }
  throw lastErr
}

// Unguessable share token (96 bits, URL-safe). Public reports are fetched by
// this token instead of the sequential id, so they can't be enumerated.
function makeShareToken() {
  return randomBytes(12).toString('base64url')
}

// Memoize across warm invocations — the schema is idempotent, but re-running
// 5 statements on every request adds needless round-trips and latency. Cache the
// promise so concurrent calls share one init and subsequent calls are free.
let _initPromise = null
export function initDb() {
  if (_initPromise) return _initPromise
  _initPromise = withRetry(async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS usage (
        user_id TEXT PRIMARY KEY,
        report_count INTEGER NOT NULL DEFAULT 0,
        reset_at TIMESTAMPTZ NOT NULL DEFAULT (date_trunc('month', now()) + interval '1 month')
      )
    `
    await sql`
      CREATE TABLE IF NOT EXISTS reports (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        ticker TEXT NOT NULL,
        result JSONB NOT NULL,
        share_token TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `
    await sql`CREATE INDEX IF NOT EXISTS reports_user_id_idx ON reports (user_id, created_at DESC)`
    // Migrate existing tables: add the column, backfill tokens for old rows,
    // enforce uniqueness. All idempotent — no-ops once applied.
    await sql`ALTER TABLE reports ADD COLUMN IF NOT EXISTS share_token TEXT`
    await sql`UPDATE reports SET share_token = replace(gen_random_uuid()::text, '-', '') WHERE share_token IS NULL`
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS reports_share_token_idx ON reports (share_token)`
    await sql`
      CREATE TABLE IF NOT EXISTS waitlist (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `
  }).catch(err => { _initPromise = null; throw err }) // reset so a failed init can retry
  return _initPromise
}

export async function getUsage(userId) {
  return withRetry(async () => {
    await sql`INSERT INTO usage (user_id) VALUES (${userId}) ON CONFLICT (user_id) DO NOTHING`
    await sql`
      UPDATE usage SET report_count = 0, reset_at = date_trunc('month', now()) + interval '1 month'
      WHERE user_id = ${userId} AND reset_at < now()
    `
    const rows = await sql`SELECT report_count, reset_at FROM usage WHERE user_id = ${userId}`
    return rows[0]
  })
}

export async function incrementUsage(userId) {
  await sql`UPDATE usage SET report_count = report_count + 1 WHERE user_id = ${userId}`
}

export async function saveReport(userId, ticker, result) {
  const token = makeShareToken()
  const rows = await sql`
    INSERT INTO reports (user_id, ticker, result, share_token)
    VALUES (${userId}, ${ticker}, ${JSON.stringify(result)}, ${token})
    RETURNING id, share_token
  `
  return { id: rows[0].id, shareToken: rows[0].share_token }
}

// Public fetch by unguessable token (not the sequential id) — prevents enumeration.
export async function getReportByToken(token) {
  const rows = await sql`SELECT ticker, result, created_at FROM reports WHERE share_token = ${token}`
  return rows[0] || null
}

export async function getReports(userId) {
  const rows = await sql`
    SELECT id, ticker, result, share_token, created_at FROM reports
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT 50
  `
  return rows
}

export async function addToWaitlist(email) {
  await sql`INSERT INTO waitlist (email) VALUES (${email}) ON CONFLICT (email) DO NOTHING`
}

export { sql }
