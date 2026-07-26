import { getReportByToken, initDb } from './db.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  // Reports are fetched by an unguessable share token, not the sequential id —
  // this prevents enumerating every user's report.
  const token = req.query.token
  if (!token || !/^[A-Za-z0-9_-]{10,64}$/.test(token)) {
    return res.status(400).json({ error: 'Invalid report link' })
  }

  try {
    await initDb()
    const report = await getReportByToken(token)
    if (!report) return res.status(404).json({ error: 'Report not found' })
    return res.status(200).json(report)
  } catch (err) {
    console.error('Report fetch error:', err)
    return res.status(500).json({ error: 'Failed to load report' })
  }
}
