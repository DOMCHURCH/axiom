import { verifyClerkToken } from './auth.js'
import { getUsage, incrementUsage, initDb } from './db.js'

const MODEL = 'llama-3.3-70b-versatile'

async function callGroq({ prompt, systemPrompt }) {
  const messages = []
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
  messages.push({ role: 'user', content: prompt })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45_000)

  let r
  try {
    r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({ model: MODEL, messages, max_tokens: 8096 }),
    })
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('AI request timed out — try again.')
    throw err
  } finally {
    clearTimeout(timeout)
  }
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
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: 'Database not configured.' })

  const userId = await verifyClerkToken(req)
  if (!userId) {
    return res.status(401).json({ error: 'Sign in to run reports.', requiresAuth: true })
  }

  try {
    await initDb()
  } catch (err) {
    console.error('DB init error:', err)
    return res.status(503).json({ error: 'Database connection failed. Please try again.' })
  }

  let usage
  try {
    usage = await getUsage(userId)
  } catch (err) {
    console.error('Usage fetch error:', err)
    return res.status(503).json({ error: 'Could not verify usage. Please try again.' })
  }

  // Reports are unlimited for all signed-in users. We still record usage below
  // (incrementUsage) for analytics, but no longer gate on it.

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
