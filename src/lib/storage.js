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
  if (key.startsWith('csk-')) return { provider: 'cerebras', model: 'llama-4-scout-17b-16e-instruct' }
  if (key.startsWith('gsk_')) return { provider: 'groq', model: 'llama-3.3-70b-versatile' }
  if (key.startsWith('sk-or-')) return { provider: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct' }
  if (key.startsWith('sk-ant-')) return { provider: 'anthropic', model: 'claude-3-5-haiku-20241022' }
  if (key.startsWith('sk-')) return { provider: 'openai', model: 'gpt-4o-mini' }
  return null
}

export function saveToHistory(ticker, reportWithFinancials) {
  const history = loadHistory()
  const entry = { ticker, report: reportWithFinancials, timestamp: Date.now() }
  const updated = [entry, ...history.filter(h => h.ticker !== ticker)].slice(0, 15)
  try {
    localStorage.setItem(HISTORY_STORE, JSON.stringify(updated))
  } catch {
    // localStorage full — drop oldest and retry
    const trimmed = updated.slice(0, 5)
    localStorage.setItem(HISTORY_STORE, JSON.stringify(trimmed))
  }
}

export function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_STORE) || '[]')
  } catch {
    return []
  }
}
