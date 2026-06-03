import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { UserButton, SignInButton, useUser, useAuth } from '@clerk/clerk-react'
import ResearchReport from './components/ResearchReport.jsx'
import { saveToHistory, loadHistory } from './lib/storage.js'
import { generateResearch } from './lib/ai.js'
import { exportReportPDF } from './lib/exportPDF.js'

const T = {
  bg:      '#05080f',
  bg2:     '#080d16',
  bg3:     '#0c1220',
  panel:   '#0e1525',
  border:  '#1a2640',
  border2: '#243350',
  accent:  '#0ea5e9',
  accentLo:'#0ea5e912',
  accentBd:'#0ea5e938',
  green:   '#10b981',
  red:     '#ef4444',
  gold:    '#f59e0b',
  text:    '#e2e8f0',
  muted:   '#4a6080',
  muted2:  '#7a90a8',
  mono:    "'IBM Plex Mono', monospace",
  sans:    "'Inter', sans-serif",
}

const REC_COLOR = { BUY: '#10b981', HOLD: '#f59e0b', SELL: '#ef4444' }
const FREE_LIMIT = 2
const clerkEnabled = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

function Spinner() {
  return <div style={{ display: 'inline-block', width: 13, height: 13, border: `2px solid ${T.accent}30`, borderTopColor: T.accent, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
}

function AppUserButton() {
  const { isSignedIn } = useUser()
  if (isSignedIn) return <UserButton afterSignOutUrl="/" appearance={{ variables: { colorPrimary: T.accent } }} />
  return (
    <SignInButton mode="modal">
      <button style={{ fontFamily: T.mono, fontSize: 11, color: T.muted2, background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 4, padding: '5px 12px', cursor: 'pointer' }}>Sign in</button>
    </SignInButton>
  )
}

export default function App() {
  const [ticker, setTicker] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [progressPct, setProgressPct] = useState(0)
  const [error, setError] = useState('')
  const [report, setReport] = useState(null)
  const [financials, setFinancials] = useState(null)
  const [currentTicker, setCurrentTicker] = useState('')
  const [history, setHistory] = useState([])
  const [usage, setUsage] = useState(null)
  const [reportId, setReportId] = useState(null)
  const [copied, setCopied] = useState(false)
  const inputRef = useRef(null)
  const { isSignedIn } = useUser()
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  useEffect(() => { setHistory(loadHistory()) }, [])

  // Auto-run if ?q= param is present (e.g. redirected from landing page)
  useEffect(() => {
    const q = searchParams.get('q')
    if (q && isSignedIn) {
      setTicker(q.toUpperCase())
      runAnalysis(q.toUpperCase())
    }
  }, [isSignedIn, searchParams])

  useEffect(() => {
    if (!isSignedIn || !clerkEnabled) return
    getToken().then(token =>
      fetch('/api/usage', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(setUsage).catch(() => {})
    )
  }, [isSignedIn, getToken])

  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = `@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}@media print{.no-print{display:none!important}body{background:#fff!important}@page{margin:14mm}}`
    document.head.appendChild(style)
    return () => document.head.removeChild(style)
  }, [])

  async function runAnalysis(t) {
    if (!t?.trim() || loading) return
    if (!isSignedIn) { setError('Sign in to run reports — it\'s free.'); return }
    const sym = t.trim().toUpperCase()
    setLoading(true); setError(''); setReport(null); setFinancials(null); setProgressPct(10)
    try {
      setProgress('Fetching SEC EDGAR filings...')
      const edgarRes = await fetch(`/api/edgar?ticker=${encodeURIComponent(sym)}`)
      const edgarData = await edgarRes.json()
      if (!edgarRes.ok) throw new Error(edgarData.error || 'SEC EDGAR lookup failed')
      setFinancials(edgarData.financials)
      setProgressPct(40)
      const clerkToken = await getToken()
      const result = await generateResearch({
        ticker: sym, financials: edgarData.financials, clerkToken,
        onProgress: msg => { setProgress(msg); setProgressPct(p => Math.min(p + 20, 92)) },
      })
      setProgressPct(100); setReport(result); setCurrentTicker(sym); setReportId(null)
      saveToHistory(sym, { ...result, financials: edgarData.financials })
      setHistory(loadHistory())
      getToken().then(token => {
        const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
        // Save to cloud history and capture ID for sharing
        fetch('/api/reports', { method: 'POST', headers, body: JSON.stringify({ ticker: sym, result }) })
          .then(r => r.json()).then(d => { if (d.id) setReportId(d.id) }).catch(() => {})
        // Refresh usage
        fetch('/api/usage', { headers }).then(r => r.json()).then(setUsage).catch(() => {})
      })
    } catch (err) {
      setError(err.limitReached ? `Monthly limit reached. Pro plan coming soon — resets ${new Date(err.resetAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}.` : err.message)
    } finally {
      setLoading(false); setProgress(''); setProgressPct(0)
    }
  }

  // ── Report view ──────────────────────────────────────────────────────────────
  if (report) {
    const rec = report.structured?.recommendation
    return (
      <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: T.sans }} className="axiom-report-root">
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeIn{from{opacity:0}to{opacity:1}}@media print{.no-print{display:none!important}.axiom-report-root{background:#fff!important}body{background:#fff!important}@page{margin:14mm}}.axiom-btn:active{transform:scale(0.96);opacity:0.85;}`}</style>

        <header className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', height: 52, borderBottom: `1px solid ${T.border}`, background: T.bg2, position: 'sticky', top: 0, zIndex: 50 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            <div style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 700, color: T.accent, letterSpacing: 3, marginRight: 20 }}>AXIOM</div>
            <div style={{ width: 1, height: 28, background: T.border, marginRight: 16 }} />
            <button
              className="axiom-btn"
              onClick={() => { setReport(null); setTicker(''); setTimeout(() => inputRef.current?.focus(), 50) }}
              style={{ fontFamily: T.mono, fontSize: 11, color: T.muted2, background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 0', display: 'flex', alignItems: 'center', gap: 6 }}
              onMouseEnter={e => e.currentTarget.style.color = T.text}
              onMouseLeave={e => e.currentTarget.style.color = T.muted2}
            >
              ← Back
            </button>
            <div style={{ width: 1, height: 20, background: T.border, margin: '0 14px' }} />
            <span style={{ fontFamily: T.mono, fontSize: 12, color: T.text, fontWeight: 700 }}>{currentTicker}</span>
            {rec && (
              <span style={{ marginLeft: 10, fontFamily: T.mono, fontSize: 10, fontWeight: 700, color: REC_COLOR[rec], background: REC_COLOR[rec] + '18', border: `1px solid ${REC_COLOR[rec]}35`, borderRadius: 4, padding: '3px 8px', letterSpacing: 0.8 }}>{rec}</span>
            )}
            {report.structured?.targetPrice && (
              <span style={{ marginLeft: 10, fontFamily: T.mono, fontSize: 11, color: T.muted2 }}>
                Target <span style={{ color: T.text }}>${report.structured.targetPrice.toFixed(0)}</span>
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {usage?.isAdmin && reportId && (
              <button className="axiom-btn" onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/report/${reportId}`)
                setCopied(true); setTimeout(() => setCopied(false), 2000)
              }} style={{ fontFamily: T.mono, fontSize: 11, color: copied ? T.green : T.muted2, background: copied ? T.green + '15' : 'transparent', border: `1px solid ${copied ? T.green + '44' : T.border}`, borderRadius: 5, padding: '6px 14px', cursor: 'pointer', transition: 'all 0.2s' }}>
                {copied ? '✓ Copied' : '⎘ Share'}
              </button>
            )}
            {usage?.isAdmin ? (
              <button className="axiom-btn" onClick={() => exportReportPDF(currentTicker, report, financials || {})} style={{ fontFamily: T.mono, fontSize: 11, color: T.accent, background: T.accentLo, border: `1px solid ${T.accentBd}`, borderRadius: 5, padding: '6px 14px', cursor: 'pointer' }}>
                ⤓ Export PDF
              </button>
            ) : (
              <div title="Pro feature — coming soon" style={{ fontFamily: T.mono, fontSize: 11, color: T.muted, background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 5, padding: '6px 14px', cursor: 'not-allowed', display: 'flex', alignItems: 'center', gap: 6 }}>
                ⤓ Export PDF <span style={{ fontSize: 9, color: T.accent, background: T.accentLo, border: `1px solid ${T.accentBd}`, borderRadius: 3, padding: '1px 5px', letterSpacing: 0.5 }}>PRO</span>
              </div>
            )}
            {clerkEnabled && <AppUserButton />}
          </div>
        </header>

        <div id="axiom-report" style={{ animation: 'fadeIn 0.25s ease' }}>
          <ResearchReport ticker={currentTicker} financials={financials || {}} result={report} />
        </div>
      </div>
    )
  }

  // ── Search / home view ───────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: T.sans, display: 'flex', flexDirection: 'column' }}>

      {/* Top bar */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', height: 52, borderBottom: `1px solid ${T.border}`, background: T.bg2, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div onClick={() => navigate('/')} style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 700, color: T.accent, letterSpacing: 3, cursor: 'pointer' }}>AXIOM</div>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted, background: T.bg3, border: `1px solid ${T.border}`, borderRadius: 4, padding: '3px 8px', letterSpacing: 1 }}>EQUITY RESEARCH</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {usage && (
            usage.isAdmin ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: T.mono, fontSize: 9, color: T.accent, background: T.accentLo, border: `1px solid ${T.accentBd}`, borderRadius: 4, padding: '3px 8px', letterSpacing: 1 }}>ADMIN</span>
                <span style={{ fontFamily: T.mono, fontSize: 10, color: T.muted2 }}>∞ reports</span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {Array.from({ length: FREE_LIMIT }).map((_, i) => (
                    <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: i < (FREE_LIMIT - usage.remaining) ? T.muted : T.accent, border: `1px solid ${T.border2}` }} />
                  ))}
                </div>
                <span style={{ fontFamily: T.mono, fontSize: 10, color: usage.remaining === 0 ? T.red : T.muted2 }}>
                  {usage.remaining}/{FREE_LIMIT} reports
                </span>
              </div>
            )
          )}
          {clerkEnabled && isSignedIn && (
            <button className="axiom-btn" onClick={() => navigate('/account')} style={{ fontFamily: T.mono, fontSize: 11, color: T.muted2, background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 4, padding: '5px 12px', cursor: 'pointer', transition: 'color 0.15s' }}
              onMouseEnter={e => e.target.style.color = T.text}
              onMouseLeave={e => e.target.style.color = T.muted2}
            >Account</button>
          )}
          {clerkEnabled && <AppUserButton />}
        </div>
      </header>

      {/* Main content */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '40px 24px' }}>

        {!isSignedIn ? (
          /* Sign-in gate */
          <div style={{ textAlign: 'center', maxWidth: 400 }}>
            <div style={{ fontFamily: T.mono, fontSize: 40, fontWeight: 700, color: T.accent, letterSpacing: 4, marginBottom: 24 }}>AXIOM</div>
            <div style={{ fontSize: 15, color: T.muted2, lineHeight: 1.7, marginBottom: 8 }}>
              Institutional equity research on any US stock in under 60 seconds.
            </div>
            <div style={{ fontFamily: T.mono, fontSize: 12, color: T.muted, marginBottom: 32 }}>2 free reports/month · No credit card</div>
            <SignInButton mode="modal">
              <button style={{ background: T.accent, color: '#000', border: 'none', borderRadius: 8, padding: '13px 36px', fontFamily: T.mono, fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.3, marginBottom: 12 }}>
                Sign up free →
              </button>
            </SignInButton>
            <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted }}>Google · GitHub · X · Email</div>
          </div>
        ) : (
          <div style={{ width: '100%', maxWidth: 600 }}>
            {/* Search area */}
            <div style={{ textAlign: 'center', marginBottom: 36 }}>
              <div style={{ fontFamily: T.mono, fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16 }}>
                Generate a report
              </div>

              <form onSubmit={e => { e.preventDefault(); runAnalysis(ticker) }}>
                <div style={{ display: 'flex', gap: 0, background: T.panel, border: `1px solid ${loading ? T.accent + '66' : T.border2}`, borderRadius: 10, overflow: 'hidden', marginBottom: 14, transition: 'border-color 0.15s', boxShadow: loading ? `0 0 0 3px ${T.accent}12` : 'none' }}>
                  <div style={{ padding: '0 16px', display: 'flex', alignItems: 'center', borderRight: `1px solid ${T.border}` }}>
                    <span style={{ fontFamily: T.mono, fontSize: 13, color: T.muted }}>$</span>
                  </div>
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder="Enter ticker symbol — AAPL, NVDA, MSFT..."
                    value={ticker}
                    onChange={e => setTicker(e.target.value.toUpperCase().replace(/[^A-Z.]/g, ''))}
                    disabled={loading || (usage && usage.remaining === 0)}
                    autoFocus
                    style={{ flex: 1, background: 'transparent', border: 'none', padding: '18px 16px', color: T.text, fontFamily: T.mono, fontSize: 16, outline: 'none' }}
                  />
                  <button
                    className="axiom-btn"
                    type="submit"
                    disabled={loading || !ticker.trim() || (usage && usage.remaining === 0)}
                    style={{ background: loading || !ticker.trim() || (usage && usage.remaining === 0) ? T.bg3 : T.accent, color: loading || !ticker.trim() || (usage && usage.remaining === 0) ? T.muted : '#000', border: 'none', padding: '0 28px', fontFamily: T.mono, fontSize: 12, fontWeight: 700, cursor: loading || !ticker.trim() || (usage && usage.remaining === 0) ? 'not-allowed' : 'pointer', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.15s', whiteSpace: 'nowrap' }}
                  >
                    {loading ? <><Spinner /> Running...</> : 'Analyze →'}
                  </button>
                </div>
              </form>

              {/* Progress */}
              {loading && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ height: 2, background: T.border, borderRadius: 1, overflow: 'hidden', marginBottom: 8 }}>
                    <div style={{ height: '100%', background: T.accent, width: progressPct + '%', transition: 'width 0.5s ease', borderRadius: 1 }} />
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: 11, color: T.accent, animation: 'pulse 1.5s infinite' }}>{progress}</div>
                </div>
              )}

              {error && (
                <div style={{ background: T.red + '10', border: `1px solid ${T.red}30`, borderRadius: 8, padding: '16px 18px', marginBottom: 14, textAlign: 'left' }}>
                  <div style={{ fontFamily: T.mono, fontSize: 10, color: T.red, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Error</div>
                  <div style={{ fontFamily: T.mono, fontSize: 12, color: T.muted2, lineHeight: 1.6, marginBottom: 12 }}>{error}</div>
                  {!error.includes('limit') && !error.includes('Sign in') && (
                    <button onClick={() => { setError(''); runAnalysis(currentTicker || ticker) }}
                      style={{ fontFamily: T.mono, fontSize: 11, color: T.text, background: T.bg3, border: `1px solid ${T.border2}`, borderRadius: 5, padding: '6px 14px', cursor: 'pointer' }}>
                      ↺ Try again
                    </button>
                  )}
                </div>
              )}

              {usage?.remaining === 0 && (
                <div style={{ background: T.accentLo, border: `1px solid ${T.accentBd}`, borderRadius: 7, padding: '12px 16px', fontFamily: T.mono, fontSize: 11, color: T.accent, marginBottom: 14 }}>
                  Monthly limit reached — Pro plan coming soon. Resets {new Date(usage.resetAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}.
                </div>
              )}

              {/* Popular tickers */}
              {!loading && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META', 'AMZN', 'TSLA', 'JPM'].map(t => (
                    <button key={t} onClick={() => { setTicker(t); runAnalysis(t) }}
                      style={{ fontFamily: T.mono, fontSize: 11, color: T.muted2, background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 5, padding: '5px 12px', cursor: 'pointer', transition: 'all 0.1s' }}
                      onMouseEnter={e => { e.target.style.borderColor = T.accentBd; e.target.style.color = T.accent }}
                      onMouseLeave={e => { e.target.style.borderColor = T.border; e.target.style.color = T.muted2 }}
                    >{t}</button>
                  ))}
                </div>
              )}
            </div>

            {/* Recent reports */}
            {history.length > 0 && !loading && (
              <div>
                <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12, textAlign: 'left' }}>
                  Recent reports
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {history.slice(0, 8).map(h => {
                    const rec = h.report?.structured?.recommendation
                    const recColor = REC_COLOR[rec]
                    const target = h.report?.structured?.targetPrice
                    const company = h.report?.structured?.companyDescription?.split(' ').slice(0, 4).join(' ')
                    return (
                      <button key={h.ticker}
                        onClick={() => { setReport(h.report); setCurrentTicker(h.ticker); setFinancials(h.report?.financials || null) }}
                        style={{ background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 7, padding: '12px 16px', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 16, transition: 'border-color 0.1s, background 0.1s' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = T.border2; e.currentTarget.style.background = T.panel }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.bg2 }}
                      >
                        <div style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 700, color: T.text, minWidth: 52 }}>{h.ticker}</div>
                        <div style={{ flex: 1, fontFamily: T.sans, fontSize: 12, color: T.muted2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {h.report?.financials?.companyName || ''}
                        </div>
                        {target && <div style={{ fontFamily: T.mono, fontSize: 11, color: T.muted2 }}>${Math.round(target)}</div>}
                        {rec && (
                          <div style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 700, color: recColor, background: recColor + '18', border: `1px solid ${recColor}35`, borderRadius: 4, padding: '3px 8px', letterSpacing: 0.8, flexShrink: 0 }}>{rec}</div>
                        )}
                        <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted, flexShrink: 0 }}>
                          {new Date(h.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Status bar */}
      <footer style={{ height: 30, borderTop: `1px solid ${T.border}`, background: T.bg2, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 20, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: T.green, boxShadow: `0 0 4px ${T.green}` }} />
          <span style={{ fontFamily: T.mono, fontSize: 9, color: T.muted }}>SEC EDGAR · Live</span>
        </div>
        <span style={{ fontFamily: T.mono, fontSize: 9, color: T.border2 }}>|</span>
        <span style={{ fontFamily: T.mono, fontSize: 9, color: T.muted }}>Groq · llama-3.3-70b</span>
        <span style={{ fontFamily: T.mono, fontSize: 9, color: T.border2 }}>|</span>
        <span style={{ fontFamily: T.mono, fontSize: 9, color: T.muted }}>8,400+ US stocks</span>
      </footer>
    </div>
  )
}
