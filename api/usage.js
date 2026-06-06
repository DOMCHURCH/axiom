import { getUsage, initDb } from './db.js'
import { verifyClerkToken } from './auth.js'

const FREE_LIMIT = 2 // must match api/ai.js enforcement

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'Database not configured.' })

  const userId = await verifyClerkToken(req)
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  try {
    await initDb()
    const usage = await getUsage(userId)
    const adminIds = (process.env.ADMIN_USER_IDS || '').split(',').filter(Boolean)
    const isAdmin = adminIds.includes(userId)
    return res.status(200).json({
      used: usage.report_count,
      // null = unlimited (Infinity would serialize to null anyway; be explicit)
      limit: isAdmin ? null : FREE_LIMIT,
      remaining: isAdmin ? null : Math.max(0, FREE_LIMIT - usage.report_count),
      resetAt: usage.reset_at,
      isAdmin,
    })
  } catch (err) {
    console.error('Usage error:', err)
    return res.status(503).json({ error: 'Database connection failed.' })
  }
}
