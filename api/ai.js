import { verifyClerkToken } from './auth.js'
import { getUsage, incrementUsage, initDb } from './db.js'

const FREE_LIMIT = 5

const PROVIDERS = {
  anthropic: async ({ prompt, apiKey, model, systemPrompt }) => {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 8096,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await r.json()
    if (!r.ok) throw new Error(data.error?.message || `Anthropic: ${r.status}`)
    return data.content[0].text
  },

  openai: async ({ prompt, apiKey, model, systemPrompt }) => {
    const messages = []
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
    messages.push({ role: 'user', content: prompt })
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, max_tokens: 8096 }),
    })
    const data = await r.json()
    if (!r.ok) throw new Error(data.error?.message || `OpenAI: ${r.status}`)
    return data.choices[0].message.content
  },

  groq: async ({ prompt, apiKey, model, systemPrompt }) => {
    const messages = []
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
    messages.push({ role: 'user', content: prompt })
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, max_tokens: 8096 }),
    })
    const data = await r.json()
    if (!r.ok) throw new Error(data.error?.message || `Groq: ${r.status}`)
    return data.choices[0].message.content
  },

  openrouter: async ({ prompt, apiKey, model, systemPrompt }) => {
    const messages = []
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
    messages.push({ role: 'user', content: prompt })
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://axiom.vercel.app',
        'X-Title': 'AXIOM Equity Research',
      },
      body: JSON.stringify({ model, messages, max_tokens: 8096 }),
    })
    const data = await r.json()
    if (!r.ok) throw new Error(data.error?.message || `OpenRouter: ${r.status}`)
    return data.choices[0].message.content
  },
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { prompt, systemPrompt, model } = req.body
  let { apiKey, provider } = req.body

  // Server-side mode: signed-in user with no BYOK key
  const userId = await verifyClerkToken(req)
  const serverSide = !apiKey && !!userId

  if (serverSide) {
    const groqKey = process.env.GROQ_API_KEY
    if (!groqKey) return res.status(503).json({ error: 'Server-side AI unavailable.' })

    await initDb()
    const usage = await getUsage(userId)
    if (usage.report_count >= FREE_LIMIT) {
      return res.status(429).json({
        error: `Free limit reached (${FREE_LIMIT} reports/month). Upgrade to Pro or add your own API key for unlimited access.`,
        limitReached: true,
        used: usage.report_count,
        limit: FREE_LIMIT,
        resetAt: usage.reset_at,
      })
    }

    apiKey = groqKey
    provider = 'groq'
  }

  if (!prompt || !apiKey || !provider) {
    return res.status(400).json({ error: 'prompt, apiKey, provider required' })
  }

  const resolvedModel = model || 'llama-3.3-70b-versatile'
  const fn = PROVIDERS[provider]
  if (!fn) return res.status(400).json({ error: `Unknown provider: ${provider}` })

  try {
    const content = await fn({ prompt, systemPrompt, apiKey, model: resolvedModel })

    if (serverSide) await incrementUsage(userId)

    res.status(200).json({ content, serverSide })
  } catch (err) {
    console.error('AI proxy error:', err)
    res.status(500).json({ error: err.message })
  }
}
