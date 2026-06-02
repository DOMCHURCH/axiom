import { getReports, saveReport, initDb } from './db.js'
import { verifyClerkToken } from './auth.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const userId = await verifyClerkToken(req)
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  await initDb()

  if (req.method === 'GET') {
    const reports = await getReports(userId)
    return res.status(200).json({ reports })
  }

  if (req.method === 'POST') {
    const { ticker, result } = req.body || {}
    if (!ticker || !result) return res.status(400).json({ error: 'ticker and result required' })
    await saveReport(userId, ticker, result)
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
