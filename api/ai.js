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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { prompt, systemPrompt, apiKey, provider, model } = req.body
  if (!prompt || !apiKey || !provider || !model) {
    return res.status(400).json({ error: 'prompt, apiKey, provider, model required' })
  }

  const fn = PROVIDERS[provider]
  if (!fn) return res.status(400).json({ error: `Unknown provider: ${provider}` })

  try {
    const content = await fn({ prompt, systemPrompt, apiKey, model })
    res.status(200).json({ content })
  } catch (err) {
    console.error('AI proxy error:', err)
    res.status(500).json({ error: err.message })
  }
}
