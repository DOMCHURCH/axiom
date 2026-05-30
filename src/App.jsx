import { useState, useEffect, useRef } from 'react'
import ApiKeyModal from './components/ApiKeyModal.jsx'
import ResearchReport from './components/ResearchReport.jsx'
import { loadKey, saveKey, detectProvider, saveToHistory, loadHistory } from './lib/storage.js'
import { generateResearch } from './lib/ai.js'

const C = {
  bg: '#0a0a0a', panel: '#111', border: '#1e1e1e',
  accent: '#38bdf8', negative: '#f87171', positive: '#22c55e',
  muted: '#4b5563', muted2: '#6b7280',
  mono: "'IBM Plex Mono', monospace", sans: "'Inter', sans-serif",
}

const REC_COLOR = { BUY: '#22c55e', HOLD: '#f59e0b', SELL: '#f87171' }

const POPULAR = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META', 'AMZN', 'TSLA', 'JPM', 'V', 'NFLX']

function Spinner() {
  return (
    <div style={{ display: 'inline-block', width: 14, height: 14, border: `2px solid #38bdf840`, borderTopColor: '#38bdf8', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
  )
}

export default function App() {
  const [apiKey, setApiKey] = useState('')
  const [provider, setProvider] = useState(null)
  const [showKeyModal, setShowKeyModal] = useState(false)
  const [ticker, setTicker] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [progressPct, setProgressPct] = useState(0)
  const [error, setError] = useState('')
  const [report, setReport] = useState(null)
  const [financials, setFinancials] = useState(null)
  const [currentTicker, setCurrentTicker] = useState('')
  const [history, setHistory] = useState([])
  const inputRef = useRef(null)

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

  // Inject keyframe animation
  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = `@keyframes spin { to { transform: rotate(360deg) } } @keyframes fadeIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }`
    document.head.appendChild(style)
    return () => document.head.removeChild(style)
  }, [])

  function handleKeySave(key, det) {
    saveKey(key)
    setApiKey(key)
    setProvider(det)
    setShowKeyModal(false)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  async function runAnalysis(t) {
    if (!t?.trim() || loading) return
    const sym = t.trim().toUpperCase()
    setLoading(true)
    setError('')
    setReport(null)
    setFinancials(null)
    setProgressPct(10)

    try {
      setProgress('Fetching SEC EDGAR filings...')
      const edgarRes = await fetch(`/api/edgar?ticker=${encodeURIComponent(sym)}`)
      const edgarData = await edgarRes.json()
      if (!edgarRes.ok) throw new Error(edgarData.error || 'SEC EDGAR lookup failed')
      setFinancials(edgarData.financials)
      setProgressPct(35)

      const result = await generateResearch({
        ticker: sym,
        financials: edgarData.financials,
        apiKey,
        provider: provider.provider,
        model: provider.model,
        onProgress: (msg) => {
          setProgress(msg)
          setProgressPct(p => Math.min(p + 20, 92))
        },
      })

      setProgressPct(100)
      setReport(result)
      setCurrentTicker(sym)
      saveToHistory(sym, { ...result, financials: edgarData.financials })
      setHistory(loadHistory())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      setProgress('')
      setProgressPct(0)
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    runAnalysis(ticker)
  }

  function loadFromHistory(h) {
    setReport(h.report)
    setCurrentTicker(h.ticker)
    setFinancials(h.report?.financials || null)
  }

  const s = {
    app: { minHeight: '100vh', background: C.bg, color: '#e5e5e5', fontFamily: C.sans },
    nav: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 28px', height: 54, borderBottom: `1px solid ${C.border}`,
      position: 'sticky', top: 0, background: C.bg + 'f0',
      backdropFilter: 'blur(12px)', zIndex: 10,
    },
    logo: { fontFamily: C.mono, fontSize: 15, fontWeight: 700, color: C.accent, letterSpacing: 3 },
    chip: (active) => ({
      fontFamily: C.mono, fontSize: 11, color: active ? C.accent : C.muted,
      background: active ? C.accent + '15' : 'transparent',
      border: `1px solid ${active ? C.accent + '44' : C.border}`,
      borderRadius: 4, padding: '4px 10px', cursor: 'pointer',
    }),
  }

  if (report) {
    return (
      <div style={s.app}>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <nav style={s.nav}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={s.logo}>AXIOM</div>
            <div style={{ width: 1, height: 20, background: C.border }} />
            <button
              style={{ ...s.chip(false), fontSize: 12 }}
              onClick={() => { setReport(null); setTicker(''); setTimeout(() => inputRef.current?.focus(), 50) }}
            >
              ← New Search
            </button>
            <span style={{ fontFamily: C.mono, fontSize: 12, color: C.muted2 }}>
              {currentTicker}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {report.structured?.recommendation && (
              <div style={{
                fontFamily: C.mono, fontSize: 11, fontWeight: 700,
                color: REC_COLOR[report.structured.recommendation],
                background: REC_COLOR[report.structured.recommendation] + '15',
                border: `1px solid ${REC_COLOR[report.structured.recommendation]}33`,
                padding: '4px 10px', borderRadius: 4,
              }}>
                {report.structured.recommendation}
              </div>
            )}
            {provider && <div style={s.chip(false)}>{provider.provider.toUpperCase()}</div>}
            <button style={s.chip(false)} onClick={() => setShowKeyModal(true)}>API Key</button>
          </div>
        </nav>
        {showKeyModal && <ApiKeyModal onSave={handleKeySave} />}
        <div style={{ animation: 'fadeIn 0.3s ease' }}>
          <ResearchReport ticker={currentTicker} financials={financials || {}} result={report} />
        </div>
      </div>
    )
  }

  return (
    <div style={s.app}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } } @keyframes fadeIn { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: translateY(0) } } @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }`}</style>
      {showKeyModal && <ApiKeyModal onSave={handleKeySave} />}

      <nav style={s.nav}>
        <div style={s.logo}>AXIOM</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {provider && <div style={s.chip(true)}>{provider.provider.toUpperCase()} · {provider.model.split('/').pop()}</div>}
          <button style={s.chip(false)} onClick={() => setShowKeyModal(true)}>Change Key</button>
        </div>
      </nav>

      {/* Hero */}
      <div style={{ maxWidth: 660, margin: '0 auto', padding: '88px 24px 0', textAlign: 'center' }}>
        <div style={{
          display: 'inline-block', fontFamily: C.mono, fontSize: 10, color: C.accent,
          background: C.accent + '12', border: `1px solid ${C.accent}30`,
          padding: '5px 14px', borderRadius: 20, letterSpacing: 2, marginBottom: 24,
          textTransform: 'uppercase',
        }}>
          Institutional Equity Research
        </div>
        <h1 style={{
          fontSize: 52, fontWeight: 800, color: '#fff', letterSpacing: -2.5,
          lineHeight: 1.05, marginBottom: 16,
        }}>
          Research any stock<br />
          <span style={{ color: C.accent }}>in seconds.</span>
        </h1>
        <p style={{ fontSize: 17, color: C.muted2, lineHeight: 1.7, marginBottom: 44, maxWidth: 480, margin: '0 auto 44px' }}>
          Live SEC EDGAR data. Two-pass AI analysis. Full DCF model, comps table, risk matrix — institutional-grade output, zero infrastructure cost.
        </p>

        {/* Search form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 10, maxWidth: 440, margin: '0 auto 16px' }}>
          <input
            ref={inputRef}
            type="text"
            placeholder="Enter ticker — AAPL, MSFT, NVDA..."
            value={ticker}
            onChange={e => setTicker(e.target.value.toUpperCase().replace(/[^A-Z.]/g, ''))}
            disabled={loading}
            style={{
              flex: 1, background: '#111', border: `1px solid ${loading ? C.accent + '44' : C.border}`,
              borderRadius: 8, padding: '15px 18px', color: '#e5e5e5',
              fontFamily: C.mono, fontSize: 16, outline: 'none',
              transition: 'border-color 0.15s',
            }}
          />
          <button
            type="submit"
            disabled={loading || !ticker.trim() || !provider}
            style={{
              background: loading || !ticker.trim() || !provider ? '#1a1a1a' : C.accent,
              color: loading || !ticker.trim() || !provider ? C.muted : '#000',
              border: 'none', borderRadius: 8, padding: '15px 24px',
              fontFamily: C.mono, fontSize: 13, fontWeight: 700,
              cursor: loading || !ticker.trim() || !provider ? 'not-allowed' : 'pointer',
              letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 8,
              transition: 'background 0.15s',
            }}
          >
            {loading ? <><Spinner /> Analyzing</> : 'Analyze →'}
          </button>
        </form>

        {/* Progress bar */}
        {loading && (
          <div style={{ maxWidth: 440, margin: '0 auto 12px' }}>
            <div style={{ height: 2, background: C.border, borderRadius: 1, overflow: 'hidden' }}>
              <div style={{
                height: '100%', background: C.accent, borderRadius: 1,
                width: progressPct + '%', transition: 'width 0.5s ease',
              }} />
            </div>
            <div style={{ fontFamily: C.mono, fontSize: 11, color: C.accent, marginTop: 8, animation: 'pulse 1.5s infinite' }}>
              {progress}
            </div>
          </div>
        )}

        {error && (
          <div style={{
            maxWidth: 440, margin: '0 auto', background: '#f8717115',
            border: '1px solid #f8717130', borderRadius: 8, padding: '12px 16px',
            fontFamily: C.mono, fontSize: 12, color: C.negative, textAlign: 'left',
          }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Popular tickers */}
        {!loading && (
          <div style={{ marginTop: 36 }}>
            <div style={{ fontFamily: C.mono, fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>
              Popular
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
              {POPULAR.map(t => (
                <button
                  key={t}
                  onClick={() => { setTicker(t); runAnalysis(t) }}
                  style={{
                    fontFamily: C.mono, fontSize: 12, color: C.muted2,
                    background: 'transparent', border: `1px solid ${C.border}`,
                    borderRadius: 5, padding: '6px 14px', cursor: 'pointer',
                    transition: 'border-color 0.1s, color 0.1s',
                  }}
                  onMouseEnter={e => { e.target.style.borderColor = C.accent + '66'; e.target.style.color = C.accent }}
                  onMouseLeave={e => { e.target.style.borderColor = C.border; e.target.style.color = C.muted2 }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* History */}
      {history.length > 0 && !loading && (
        <div style={{ maxWidth: 660, margin: '60px auto 0', padding: '0 24px 80px' }}>
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 32 }}>
            <div style={{ fontFamily: C.mono, fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16 }}>
              Recent Reports
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
              {history.map(h => {
                const rec = h.report?.structured?.recommendation
                const recColor = REC_COLOR[rec]
                return (
                  <button
                    key={h.ticker}
                    onClick={() => loadFromHistory(h)}
                    style={{
                      background: C.panel, border: `1px solid ${C.border}`,
                      borderRadius: 7, padding: '14px 16px', cursor: 'pointer',
                      textAlign: 'left', transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = '#333'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontFamily: C.mono, fontSize: 14, fontWeight: 700, color: '#e5e5e5' }}>{h.ticker}</span>
                      {rec && (
                        <span style={{ fontFamily: C.mono, fontSize: 9, color: recColor, background: recColor + '15', padding: '2px 7px', borderRadius: 3 }}>
                          {rec}
                        </span>
                      )}
                    </div>
                    <div style={{ fontFamily: C.mono, fontSize: 10, color: C.muted }}>
                      {new Date(h.timestamp).toLocaleDateString()}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
