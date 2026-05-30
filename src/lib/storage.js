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
  if (key.startsWith('csk-')) return { provider: 'cerebras', model: 'llama-4-scout-17b-16e-instruct' }
  if (key.startsWith('gsk_')) return { provider: 'groq', model: 'llama-3.3-70b-versatile' }
  if (key.startsWith('sk-or-')) return { provider: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct' }
  if (key.startsWith('sk-ant-')) return { provider: 'anthropic', model: 'claude-3-5-haiku-20241022' }
  if (key.startsWith('sk-')) return { provider: 'openai', model: 'gpt-4o-mini' }
  return null
}

export function saveToHistory(ticker, report) {
  const history = loadHistory()
  const entry = { ticker, report, timestamp: Date.now() }
  const updated = [entry, ...history.filter(h => h.ticker !== ticker)].slice(0, 20)
  localStorage.setItem(HISTORY_STORE, JSON.stringify(updated))
}

export function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_STORE) || '[]')
  } catch {
    return []
  }
}
