import { useState } from 'react'
import { detectProvider } from '../lib/storage.js'

export default function ApiKeyModal({ onSave }) {
  const [key, setKey] = useState('')
  const [error, setError] = useState('')

  const detected = detectProvider(key)

  function handleSubmit(e) {
    e.preventDefault()
    if (!detected) {
      setError('Unrecognized API key format. Supported: Cerebras (csk-), Groq (gsk_), OpenRouter (sk-or-), Anthropic (sk-ant-), OpenAI (sk-)')
      return
    }
    onSave(key, detected)
  }

  const s = {
    overlay: {
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    },
    modal: {
      background: '#111', border: '1px solid #222', borderRadius: 12,
      padding: 40, width: '100%', maxWidth: 480,
    },
    logo: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 22, fontWeight: 600, color: '#38bdf8', marginBottom: 8 },
    sub: { fontSize: 14, color: '#666', marginBottom: 32, lineHeight: 1.6 },
    label: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, display: 'block' },
    input: {
      width: '100%', background: '#0a0a0a', border: '1px solid #333', borderRadius: 6,
      padding: '12px 14px', color: '#e5e5e5', fontFamily: "'IBM Plex Mono', monospace", fontSize: 13,
      outline: 'none', marginBottom: 12,
    },
    badge: {
      display: 'inline-block', background: '#38bdf822', color: '#38bdf8',
      fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, padding: '4px 10px',
      borderRadius: 4, marginBottom: 20,
    },
    error: { color: '#f87171', fontSize: 13, marginBottom: 16, lineHeight: 1.5 },
    btn: {
      width: '100%', background: '#38bdf8', color: '#000', border: 'none',
      borderRadius: 6, padding: '12px 0', fontFamily: "'IBM Plex Mono', monospace",
      fontSize: 13, fontWeight: 600, cursor: 'pointer', letterSpacing: 0.5,
    },
    note: { fontSize: 12, color: '#444', marginTop: 16, lineHeight: 1.6 },
  }

  return (
    <div style={s.overlay}>
      <div style={s.modal}>
        <div style={s.logo}>AXIOM</div>
        <div style={s.sub}>Institutional-grade equity research. Bring your own API key — your key never leaves your browser.</div>
        <form onSubmit={handleSubmit}>
          <label style={s.label}>API Key</label>
          <input
            style={s.input}
            type="password"
            placeholder="sk-ant-... / sk-... / gsk_... / sk-or-... / csk-..."
            value={key}
            onChange={e => { setKey(e.target.value); setError('') }}
            autoFocus
          />
          {detected && (
            <div style={s.badge}>
              {detected.provider.toUpperCase()} → {detected.model}
            </div>
          )}
          {error && <div style={s.error}>{error}</div>}
          <button style={s.btn} type="submit">Launch AXIOM</button>
        </form>
        <div style={s.note}>
          Supported providers: Anthropic, OpenAI, Groq, Cerebras, OpenRouter.<br />
          Keys are stored in localStorage only. Zero server-side storage.
        </div>
      </div>
    </div>
  )
}
