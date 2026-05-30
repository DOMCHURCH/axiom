import { useState } from 'react'
import { detectProvider } from '../lib/storage.js'

const PROVIDERS = [
  { prefix: 'sk-ant-', name: 'Anthropic', model: 'claude-3-5-haiku-20241022', color: '#d97706' },
  { prefix: 'sk-or-', name: 'OpenRouter', model: 'meta-llama/llama-3.3-70b-instruct', color: '#8b5cf6' },
  { prefix: 'gsk_', name: 'Groq', model: 'llama-3.3-70b-versatile', color: '#f59e0b' },
  { prefix: 'csk-', name: 'Cerebras', model: 'z.ai/glm-4.7', color: '#22c55e' },
  { prefix: 'sk-', name: 'OpenAI', model: 'gpt-4o-mini', color: '#38bdf8' },
]

const C = {
  bg: '#0a0a0a', panel: '#111', border: '#1e1e1e',
  accent: '#38bdf8', muted: '#4b5563',
  mono: "'IBM Plex Mono', monospace", sans: "'Inter', sans-serif",
}

export default function ApiKeyModal({ onSave }) {
  const [key, setKey] = useState('')
  const [error, setError] = useState('')

  const detected = detectProvider(key)
  const provInfo = detected ? PROVIDERS.find(p => p.name.toLowerCase() === detected.provider) : null

  function handleSubmit(e) {
    e.preventDefault()
    if (!key.trim()) return
    if (!detected) {
      setError('Unrecognized key format. See supported providers below.')
      return
    }
    onSave(key.trim(), detected)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, fontFamily: C.sans, padding: 16,
    }}>
      <div style={{
        background: C.panel, border: `1px solid ${C.border}`,
        borderRadius: 12, padding: '40px 44px', width: '100%', maxWidth: 480,
      }}>
        {/* Logo */}
        <div style={{ fontFamily: C.mono, fontSize: 22, fontWeight: 700, color: '#38bdf8', letterSpacing: 3, marginBottom: 4 }}>
          AXIOM
        </div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 32, lineHeight: 1.6 }}>
          Institutional equity research. Zero inference cost — your key stays in your browser.
        </div>

        <form onSubmit={handleSubmit}>
          <label style={{ fontFamily: C.mono, fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1.5, display: 'block', marginBottom: 8 }}>
            API Key
          </label>
          <input
            type="password"
            placeholder="Paste your API key..."
            value={key}
            onChange={e => { setKey(e.target.value); setError('') }}
            autoFocus
            style={{
              width: '100%', background: C.bg, border: `1px solid ${detected ? '#38bdf855' : C.border}`,
              borderRadius: 7, padding: '13px 16px', color: '#e5e5e5',
              fontFamily: C.mono, fontSize: 13, outline: 'none', marginBottom: 12,
              transition: 'border-color 0.15s',
            }}
          />

          {/* Detected provider badge */}
          {detected && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20,
              background: (provInfo?.color || '#38bdf8') + '12',
              border: `1px solid ${provInfo?.color || '#38bdf8'}30`,
              borderRadius: 6, padding: '10px 14px',
            }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: provInfo?.color || '#38bdf8', flexShrink: 0 }} />
              <div>
                <div style={{ fontFamily: C.mono, fontSize: 12, color: provInfo?.color || '#38bdf8', fontWeight: 600 }}>
                  {detected.provider.toUpperCase()} detected
                </div>
                <div style={{ fontFamily: C.mono, fontSize: 10, color: C.muted, marginTop: 2 }}>
                  Model: {detected.model}
                </div>
              </div>
            </div>
          )}

          {error && (
            <div style={{ color: '#f87171', fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>{error}</div>
          )}

          <button
            type="submit"
            disabled={!key.trim() || !detected}
            style={{
              width: '100%', background: detected ? '#38bdf8' : '#1a1a1a',
              color: detected ? '#000' : C.muted, border: 'none', borderRadius: 7,
              padding: '13px 0', fontFamily: C.mono, fontSize: 13, fontWeight: 700,
              cursor: detected ? 'pointer' : 'not-allowed', letterSpacing: 0.5,
              transition: 'background 0.15s',
            }}
          >
            {detected ? `Launch with ${detected.provider.charAt(0).toUpperCase() + detected.provider.slice(1)} →` : 'Paste your API key above'}
          </button>
        </form>

        {/* Provider list */}
        <div style={{ marginTop: 28, borderTop: `1px solid ${C.border}`, paddingTop: 20 }}>
          <div style={{ fontFamily: C.mono, fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>
            Supported Providers
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {PROVIDERS.map(p => (
              <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: p.color }} />
                  <span style={{ fontFamily: C.mono, fontSize: 12, color: '#9ca3af' }}>{p.name}</span>
                </div>
                <span style={{ fontFamily: C.mono, fontSize: 10, color: C.muted }}>{p.prefix}...</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 20, fontSize: 11, color: '#374151', lineHeight: 1.6 }}>
          Keys are stored only in your browser's localStorage. Nothing is sent to our servers.
        </div>
      </div>
    </div>
  )
}
