import { verifyClerkToken } from './auth.js'
import { getUsage, incrementUsage, initDb } from './db.js'

const FREE_LIMIT = 2
const MODEL = 'llama-3.3-70b-versatile'

async function callGroq({ prompt, systemPrompt }) {
  const messages = []
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
  messages.push({ role: 'user', content: prompt })

  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, messages, max_tokens: 8096 }),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error?.message || `Groq error ${r.status}`)
  return data.choices[0].message.content
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!process.env.GROQ_API_KEY) return res.status(503).json({ error: 'Service temporarily unavailable.' })

  const userId = await verifyClerkToken(req)
  if (!userId) {
    return res.status(401).json({ error: 'Sign in to run reports.', requiresAuth: true })
  }

  await initDb()
  const usage = await getUsage(userId)
  if (usage.report_count >= FREE_LIMIT) {
    return res.status(429).json({
      error: `You've used your ${FREE_LIMIT} free reports this month. Pro plan coming soon — check back shortly.`,
      limitReached: true,
      used: usage.report_count,
      limit: FREE_LIMIT,
      resetAt: usage.reset_at,
    })
  }

  const { prompt, systemPrompt } = req.body || {}
  if (!prompt) return res.status(400).json({ error: 'prompt required' })

  try {
    const content = await callGroq({ prompt, systemPrompt })
    await incrementUsage(userId)
    res.status(200).json({ content })
  } catch (err) {
    console.error('AI error:', err)
    if (err.message?.includes('429') || err.message?.toLowerCase().includes('rate')) {
      return res.status(429).json({ error: 'AI is busy — try again in a moment.' })
    }
    res.status(500).json({ error: err.message })
  }
}
