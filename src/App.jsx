import { useState, useEffect } from 'react'
import ApiKeyModal from './components/ApiKeyModal.jsx'
import ResearchReport from './components/ResearchReport.jsx'
import { loadKey, saveKey, clearKey, detectProvider, saveToHistory, loadHistory } from './lib/storage.js'
import { generateResearch } from './lib/ai.js'

const C = {
  bg: '#0a0a0a',
  panel: '#111',
  border: '#1e1e1e',
  accent: '#38bdf8',
  negative: '#f87171',
  muted: '#555',
  mono: "'IBM Plex Mono', monospace",
  sans: "'Inter', sans-serif",
}

export default function App() {
  const [apiKey, setApiKey] = useState('')
  const [provider, setProvider] = useState(null)
  const [showKeyModal, setShowKeyModal] = useState(false)
  const [ticker, setTicker] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [report, setReport] = useState(null)
  const [financials, setFinancials] = useState(null)
  const [currentTicker, setCurrentTicker] = useState('')
  const [history, setHistory] = useState([])

  useEffect(() => {
    const key = loadKey()
    if (key) {
      const det = detectProvider(key)
      if (det) { setApiKey(key); setProvider(det) }
      else setShowKeyModal(true)
    } else {
      setShowKeyModal(true)
    }
    setHistory(loadHistory())
  }, [])

  function handleKeySave(key, det) {
    saveKey(key)
    setApiKey(key)
    setProvider(det)
    setShowKeyModal(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!ticker.trim()) return
    setLoading(true)
    setError('')
    setReport(null)
    setFinancials(null)

    try {
      setProgress('Fetching SEC EDGAR filings...')
      const edgarRes = await fetch(`/api/edgar?ticker=${encodeURIComponent(ticker.trim())}`)
      const edgarData = await edgarRes.json()
      if (!edgarRes.ok) throw new Error(edgarData.error || 'EDGAR fetch failed')

      setFinancials(edgarData.financials)

      const result = await generateResearch({
        ticker: ticker.trim().toUpperCase(),
        financials: edgarData.financials,
        apiKey,
        provider: provider.provider,
        model: provider.model,
        onProgress: setProgress,
      })

      setReport(result)
      setCurrentTicker(ticker.trim().toUpperCase())
      saveToHistory(ticker.trim().toUpperCase(), result)
      setHistory(loadHistory())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      setProgress('')
    }
  }

  const s = {
    app: { minHeight: '100vh', background: C.bg, color: '#e5e5e5', fontFamily: C.sans },
    nav: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 24px', height: 56, borderBottom: `1px solid ${C.border}`,
      position: 'sticky', top: 0, background: C.bg, zIndex: 10,
    },
    logo: { fontFamily: C.mono, fontSize: 16, fontWeight: 600, color: C.accent, letterSpacing: 2 },
    navRight: { display: 'flex', alignItems: 'center', gap: 16 },
    providerChip: {
      fontFamily: C.mono, fontSize: 11, color: C.muted,
      background: '#1a1a1a', border: `1px solid ${C.border}`,
      padding: '4px 10px', borderRadius: 4,
    },
    keyBtn: {
      fontFamily: C.mono, fontSize: 11, color: C.muted, background: 'transparent',
      border: `1px solid ${C.border}`, borderRadius: 4, padding: '4px 10px',
      cursor: 'pointer',
    },
    hero: {
      maxWidth: 640, margin: '80px auto 0', padding: '0 24px', textAlign: 'center',
    },
    heroTitle: { fontSize: 42, fontWeight: 700, color: '#fff', letterSpacing: -1.5, marginBottom: 12, lineHeight: 1.1 },
    heroSub: { fontSize: 16, color: '#666', lineHeight: 1.6, marginBottom: 40 },
    form: { display: 'flex', gap: 12, maxWidth: 480, margin: '0 auto' },
    input: {
      flex: 1, background: '#111', border: `1px solid ${C.border}`, borderRadius: 8,
      padding: '14px 18px', color: '#e5e5e5', fontFamily: C.mono, fontSize: 15,
      outline: 'none', textTransform: 'uppercase',
    },
    submitBtn: (disabled) => ({
      background: disabled ? '#1a1a1a' : C.accent,
      color: disabled ? C.muted : '#000',
      border: 'none', borderRadius: 8, padding: '14px 28px',
      fontFamily: C.mono, fontSize: 13, fontWeight: 600,
      cursor: disabled ? 'not-allowed' : 'pointer', letterSpacing: 0.5,
      whiteSpace: 'nowrap',
    }),
    progress: { marginTop: 24, fontFamily: C.mono, fontSize: 12, color: C.accent },
    error: { marginTop: 24, color: C.negative, fontSize: 14, fontFamily: C.mono },
    history: { maxWidth: 640, margin: '40px auto', padding: '0 24px' },
    histLabel: { fontFamily: C.mono, fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 12 },
    histList: { display: 'flex', gap: 8, flexWrap: 'wrap' },
    histChip: {
      fontFamily: C.mono, fontSize: 12, color: C.muted,
      background: '#111', border: `1px solid ${C.border}`,
      padding: '6px 12px', borderRadius: 4, cursor: 'pointer',
    },
  }

  return (
    <div style={s.app}>
      {showKeyModal && <ApiKeyModal onSave={handleKeySave} />}

      <nav style={s.nav}>
        <div style={s.logo}>AXIOM</div>
        <div style={s.navRight}>
          {provider && <div style={s.providerChip}>{provider.provider.toUpperCase()}</div>}
          <button style={s.keyBtn} onClick={() => setShowKeyModal(true)}>API Key</button>
        </div>
      </nav>

      {!report ? (
        <>
          <div style={s.hero}>
            <h1 style={s.heroTitle}>Equity Research,<br />Instantly.</h1>
            <p style={s.heroSub}>Enter a ticker. AXIOM pulls live SEC EDGAR filings and runs institutional-grade analysis using your AI key.</p>
            <form onSubmit={handleSubmit} style={s.form}>
              <input
                style={s.input}
                type="text"
                placeholder="AAPL"
                value={ticker}
                onChange={e => setTicker(e.target.value.toUpperCase())}
                disabled={loading}
              />
              <button style={s.submitBtn(loading || !ticker.trim())} type="submit" disabled={loading || !ticker.trim()}>
                {loading ? 'Analyzing...' : 'Analyze →'}
              </button>
            </form>
            {loading && <div style={s.progress}>{progress}</div>}
            {error && <div style={s.error}>{error}</div>}
          </div>

          {history.length > 0 && (
            <div style={s.history}>
              <div style={s.histLabel}>Recent</div>
              <div style={s.histList}>
                {history.map(h => (
                  <div key={h.ticker} style={s.histChip} onClick={() => {
                    setReport(h.report)
                    setCurrentTicker(h.ticker)
                    setFinancials(h.report?.financials || null)
                  }}>
                    {h.ticker}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ borderBottom: `1px solid ${C.border}`, padding: '12px 24px', display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              style={{ ...s.keyBtn, color: '#e5e5e5' }}
              onClick={() => { setReport(null); setTicker('') }}
            >
              ← New Search
            </button>
            <span style={{ fontFamily: C.mono, fontSize: 12, color: C.muted }}>
              {currentTicker} · {provider?.provider}
            </span>
          </div>
          <ResearchReport
            ticker={currentTicker}
            financials={financials || {}}
            result={report}
          />
        </>
      )}
    </div>
  )
}
