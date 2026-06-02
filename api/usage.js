import { getUsage, initDb } from './db.js'
import { verifyClerkToken } from './auth.js'

const FREE_LIMIT = 5

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const userId = await verifyClerkToken(req)
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  await initDb()
  const usage = await getUsage(userId)

  return res.status(200).json({
    used: usage.report_count,
    limit: FREE_LIMIT,
    remaining: Math.max(0, FREE_LIMIT - usage.report_count),
    resetAt: usage.reset_at,
  })
}
