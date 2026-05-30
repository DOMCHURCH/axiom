const KEY_STORE = 'axiom_api_key'
const HISTORY_STORE = 'axiom_history'

export function saveKey(key) {
  localStorage.setItem(KEY_STORE, key)
}

export function loadKey() {
  return localStorage.getItem(KEY_STORE) || ''
}

export function clearKey() {
  localStorage.removeItem(KEY_STORE)
}

export function detectProvider(key) {
  if (!key) return null
  if (key.startsWith('csk-')) return { provider: 'cerebras', model: 'glm-4-9b' }
  if (key.startsWith('gsk_')) return { provider: 'groq', model: 'llama-3.3-70b-versatile' }
  if (key.startsWith('sk-or-')) return { provider: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct' }
  if (key.startsWith('sk-ant-')) return { provider: 'anthropic', model: 'claude-3-5-haiku-20241022' }
  if (key.startsWith('sk-')) return { provider: 'openai', model: 'gpt-4o-mini' }
  return null
}

export function saveToHistory(ticker, reportWithFinancials) {
  const history = loadHistory()
  // Omit reasoning (large pass-1 text) to keep localStorage small
  const { reasoning: _, ...slim } = reportWithFinancials
  const entry = { ticker, report: slim, timestamp: Date.now() }
  const updated = [entry, ...history.filter(h => h.ticker !== ticker)].slice(0, 10)
  try {
    localStorage.setItem(HISTORY_STORE, JSON.stringify(updated))
  } catch {
    try {
      localStorage.setItem(HISTORY_STORE, JSON.stringify(updated.slice(0, 3)))
    } catch {
      localStorage.removeItem(HISTORY_STORE)
    }
  }
}

export function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_STORE) || '[]')
  } catch {
    return []
  }
}
