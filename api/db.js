import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)

// Memoize across warm invocations — the schema is idempotent, but re-running
// 5 statements on every request adds needless round-trips and latency. Cache the
// promise so concurrent calls share one init and subsequent calls are free.
let _initPromise = null
export function initDb() {
  if (_initPromise) return _initPromise
  _initPromise = (async () => {
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
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `
    await sql`CREATE INDEX IF NOT EXISTS reports_user_id_idx ON reports (user_id, created_at DESC)`
    await sql`
      CREATE TABLE IF NOT EXISTS waitlist (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `
  })().catch(err => { _initPromise = null; throw err }) // reset so a failed init can retry
  return _initPromise
}

export async function getUsage(userId) {
  await sql`INSERT INTO usage (user_id) VALUES (${userId}) ON CONFLICT (user_id) DO NOTHING`
  await sql`
    UPDATE usage SET report_count = 0, reset_at = date_trunc('month', now()) + interval '1 month'
    WHERE user_id = ${userId} AND reset_at < now()
  `
  const rows = await sql`SELECT report_count, reset_at FROM usage WHERE user_id = ${userId}`
  return rows[0]
}

export async function incrementUsage(userId) {
  await sql`UPDATE usage SET report_count = report_count + 1 WHERE user_id = ${userId}`
}

export async function saveReport(userId, ticker, result) {
  const rows = await sql`
    INSERT INTO reports (user_id, ticker, result) VALUES (${userId}, ${ticker}, ${JSON.stringify(result)})
    RETURNING id
  `
  return rows[0].id
}

export async function getReport(id) {
  const rows = await sql`SELECT id, ticker, result, created_at FROM reports WHERE id = ${id}`
  return rows[0] || null
}

export async function getReports(userId) {
  const rows = await sql`
    SELECT id, ticker, result, created_at FROM reports
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
