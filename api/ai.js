export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { prompt, apiKey, provider, model } = req.body
  if (!prompt || !apiKey || !provider || !model) {
    return res.status(400).json({ error: 'prompt, apiKey, provider, model required' })
  }

  try {
    let content

    if (provider === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
        }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error?.message || 'Anthropic error')
      content = data.content[0].text

    } else if (provider === 'openai') {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 4096,
        }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error?.message || 'OpenAI error')
      content = data.choices[0].message.content

    } else if (provider === 'groq') {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 4096,
        }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error?.message || 'Groq error')
      content = data.choices[0].message.content

    } else if (provider === 'cerebras') {
      const r = await fetch('https://api.cerebras.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 4096,
        }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error?.message || 'Cerebras error')
      content = data.choices[0].message.content

    } else if (provider === 'openrouter') {
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://axiom.vercel.app',
          'X-Title': 'AXIOM',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 4096,
        }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error?.message || 'OpenRouter error')
      content = data.choices[0].message.content

    } else {
      return res.status(400).json({ error: `Unknown provider: ${provider}` })
    }

    res.status(200).json({ content })
  } catch (err) {
    console.error('AI proxy error:', err)
    res.status(500).json({ error: err.message })
  }
}
