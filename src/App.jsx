import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { UserButton, SignInButton, useUser, useAuth } from '@clerk/clerk-react'
import ResearchReport from './components/ResearchReport.jsx'
import { saveToHistory, loadHistory } from './lib/storage.js'
import { generateResearch } from './lib/ai.js'
import { exportReportPDF } from './lib/exportPDF.js'
import { palette as T } from './lib/tokens.js'

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
      <button style={{ fontFamily: T.mono, fontSize: 11, color: T.muted2, background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 6, padding: '6px 14px', cursor: 'pointer', transition: 'all 0.15s' }}
        onMouseEnter={e => { e.target.style.borderColor = T.accentBd; e.target.style.color = T.text }}
        onMouseLeave={e => { e.target.style.borderColor = T.border; e.target.style.color = T.muted2 }}
      >Sign in</button>
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
  const [shareToken, setShareToken] = useState(null)
  const [copied, setCopied] = useState(false)
  const [inputFocused, setInputFocused] = useState(false)
  const [showPaywall, setShowPaywall] = useState(false)
  const [waitlistEmail, setWaitlistEmail] = useState('')
  const [waitlistSent, setWaitlistSent] = useState(false)
  const [waitlistLoading, setWaitlistLoading] = useState(false)
  const inputRef = useRef(null)
  const paywallShownRef = useRef(false)
  const { isSignedIn } = useUser()
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  useEffect(() => { setHistory(loadHistory()) }, [])
  useEffect(() => {
    if (usage?.remaining === 0 && !paywallShownRef.current) {
      paywallShownRef.current = true
      setShowPaywall(true)
    }
  }, [usage?.remaining])

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
    style.textContent = `
      @keyframes spin{to{transform:rotate(360deg)}}
      @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
      @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
      @keyframes shimmer{from{background-position:-200% 0}to{background-position:200% 0}}
      @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
      @keyframes modalIn{from{opacity:0;transform:scale(0.96) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}
      @media print{.no-print{display:none!important}body{background:#fff!important}@page{margin:14mm}}
      .axiom-btn:active{transform:scale(0.96)!important;opacity:0.85;}
      @media(max-width:640px){
        .ax-nav{padding:0 12px!important;gap:8px!important;}
        .ax-hide-sm{display:none!important;}
        .ax-main{padding:20px 14px 48px!important;}
        .ax-footer{padding:0 12px!important;gap:10px!important;}
        .ax-analyze-btn{padding:0 14px!important;font-size:11px!important;}
        .ax-report-hdr{padding:0 10px!important;}
        .ax-report-hdr-right{gap:6px!important;}
        .ax-export-btn{padding:6px 10px!important;}
        .ax-share-btn{padding:6px 10px!important;}
        .ax-history-item{padding:11px 13px!important;gap:10px!important;}
      }
    `
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
      setProgressPct(100); setReport(result); setCurrentTicker(sym); setShareToken(null)
      saveToHistory(sym, { ...result, financials: edgarData.financials })
      setHistory(loadHistory())
      getToken().then(token => {
        const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
        // Save to cloud history and capture ID for sharing
        fetch('/api/reports', { method: 'POST', headers, body: JSON.stringify({ ticker: sym, result: { ...result, financials: edgarData.financials } }) })
          .then(r => r.json()).then(d => { if (d.shareToken) setShareToken(d.shareToken) }).catch(() => {})
        // Refresh usage
        fetch('/api/usage', { headers }).then(r => r.json()).then(setUsage).catch(() => {})
      })
    } catch (err) {
      setError(err.limitReached ? `Monthly limit reached. Pro plan coming soon — resets ${new Date(err.resetAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}.` : err.message)
    } finally {
      setLoading(false); setProgress(''); setProgressPct(0)
    }
  }

  async function submitWaitlist(e) {
    e.preventDefault()
    if (!waitlistEmail.includes('@')) return
    setWaitlistLoading(true)
    try {
      await fetch('/api/waitlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: waitlistEmail }) })
      setWaitlistSent(true)
    } catch { /* silent */ } finally { setWaitlistLoading(false) }
  }

  // ── Report view ──────────────────────────────────────────────────────────────
  if (report) {
    const rec = report.structured?.recommendation
    const recColor = REC_COLOR[rec]
    return (
      <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: T.sans }} className="axiom-report-root">
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeIn{from{opacity:0}to{opacity:1}}@media print{.no-print{display:none!important}.axiom-report-root{background:#fff!important}body{background:#fff!important}@page{margin:14mm}}.axiom-btn:active{transform:scale(0.96);opacity:0.85;}`}</style>

        <header className="no-print ax-report-hdr" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 28px', height: 56,
          borderBottom: `1px solid ${T.border}`,
          background: `${T.bg2}f8`,
          backdropFilter: 'blur(20px) saturate(180%)',
          position: 'sticky', top: 0, zIndex: 50, gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {/* Logo */}
            <div
              onClick={() => navigate('/')}
              style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 700, color: T.accent, letterSpacing: 4, marginRight: 20, cursor: 'pointer', transition: 'text-shadow 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.textShadow = '0 0 20px #0ea5e950'}
              onMouseLeave={e => e.currentTarget.style.textShadow = 'none'}
            >AXIOM</div>
            <div style={{ width: 1, height: 28, background: T.border, marginRight: 16, flexShrink: 0 }} />
            {/* Back button */}
            <button
              className="axiom-btn"
              onClick={() => { setReport(null); setTicker(''); setTimeout(() => inputRef.current?.focus(), 50) }}
              style={{ fontFamily: T.mono, fontSize: 11, color: T.muted2, background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 0', display: 'flex', alignItems: 'center', gap: 6, transition: 'color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.color = T.text}
              onMouseLeave={e => e.currentTarget.style.color = T.muted2}
            >
              ← Back
            </button>
            <div style={{ width: 1, height: 20, background: T.border, margin: '0 16px', flexShrink: 0 }} />
            {/* Ticker badge */}
            <span style={{ fontFamily: T.mono, fontSize: 13, color: T.text, fontWeight: 700, letterSpacing: 0.5 }}>{currentTicker}</span>
            {rec && (
              <span style={{
                marginLeft: 10, fontFamily: T.mono, fontSize: 10, fontWeight: 700,
                color: recColor,
                background: recColor + '18',
                border: `1px solid ${recColor}40`,
                borderRadius: 6, padding: '3px 10px', letterSpacing: 0.8,
                boxShadow: `0 0 12px ${recColor}20`,
              }}>{rec}</span>
            )}
            {report.structured?.targetPrice && (
              <span className="ax-hide-sm" style={{ marginLeft: 12, fontFamily: T.mono, fontSize: 11, color: T.muted2 }}>
                Target <span style={{ color: T.text }}>${report.structured.targetPrice.toFixed(0)}</span>
              </span>
            )}
          </div>
          <div className="ax-report-hdr-right" style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
            {shareToken && (
              <button className="axiom-btn ax-share-btn" onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/report/${shareToken}`)
                setCopied(true); setTimeout(() => setCopied(false), 2000)
              }} style={{ fontFamily: T.mono, fontSize: 11, color: copied ? T.green : T.muted2, background: copied ? T.green + '15' : 'transparent', border: `1px solid ${copied ? T.green + '44' : T.border}`, borderRadius: 7, padding: '7px 16px', cursor: 'pointer', transition: 'all 0.2s', letterSpacing: 0.3 }}
                onMouseEnter={e => { if (!copied) { e.currentTarget.style.borderColor = T.border2; e.currentTarget.style.color = T.text } }}
                onMouseLeave={e => { if (!copied) { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.muted2 } }}
              >
                {copied ? '✓' : '⎘'}<span className="ax-hide-sm"> {copied ? 'Copied' : 'Share'}</span>
              </button>
            )}
            <button className="axiom-btn ax-export-btn" onClick={() => exportReportPDF(currentTicker, report, financials || {})} style={{ fontFamily: T.mono, fontSize: 11, color: T.accent, background: T.accentLo, border: `1px solid ${T.accentBd}`, borderRadius: 7, padding: '7px 16px', cursor: 'pointer', transition: 'all 0.15s', letterSpacing: 0.3 }}
              onMouseEnter={e => { e.currentTarget.style.background = `${T.accent}20`; e.currentTarget.style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { e.currentTarget.style.background = T.accentLo; e.currentTarget.style.transform = 'translateY(0)' }}
            >
              ⤓<span className="ax-hide-sm"> Export PDF</span>
            </button>
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
      <header className="ax-nav" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', height: 56, borderBottom: `1px solid ${T.border}`, background: `${T.bg2}f8`, backdropFilter: 'blur(20px)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            onClick={() => navigate('/')}
            style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 700, color: T.accent, letterSpacing: 4, cursor: 'pointer', transition: 'text-shadow 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.textShadow = '0 0 20px #0ea5e950'}
            onMouseLeave={e => e.currentTarget.style.textShadow = 'none'}
          >AXIOM</div>
          <div className="ax-hide-sm" style={{ fontFamily: T.mono, fontSize: 10, color: T.muted, background: T.bg3, border: `1px solid ${T.border}`, borderRadius: 5, padding: '3px 9px', letterSpacing: 1 }}>EQUITY RESEARCH</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {usage && (
            usage.isAdmin ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: T.mono, fontSize: 9, color: T.accent, background: T.accentLo, border: `1px solid ${T.accentBd}`, borderRadius: 4, padding: '3px 8px', letterSpacing: 1 }}>ADMIN</span>
                <span className="ax-hide-sm" style={{ fontFamily: T.mono, fontSize: 10, color: T.muted2 }}>∞ reports</span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: usage?.remaining === 0 ? 'pointer' : 'default' }} onClick={() => { if (usage?.remaining === 0) setShowPaywall(true) }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {Array.from({ length: FREE_LIMIT }).map((_, i) => (
                    <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: i < (FREE_LIMIT - usage.remaining) ? T.muted : T.accent, border: `1px solid ${T.border2}`, boxShadow: i >= (FREE_LIMIT - usage.remaining) ? `0 0 6px ${T.accent}60` : 'none' }} />
                  ))}
                </div>
                <span className="ax-hide-sm" style={{ fontFamily: T.mono, fontSize: 10, color: usage.remaining === 0 ? T.red : T.muted2 }}>
                  {usage.remaining}/{FREE_LIMIT}
                </span>
              </div>
            )
          )}
          {clerkEnabled && isSignedIn && (
            <button className="axiom-btn ax-hide-sm" onClick={() => navigate('/account')}
              style={{ fontFamily: T.mono, fontSize: 11, color: T.muted2, background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 6, padding: '6px 14px', cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.target.style.color = T.text; e.target.style.borderColor = T.border2 }}
              onMouseLeave={e => { e.target.style.color = T.muted2; e.target.style.borderColor = T.border }}
            >Account</button>
          )}
          {clerkEnabled && <AppUserButton />}
        </div>
      </header>

      {/* Main content */}
      <main className="ax-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '48px 24px', position: 'relative' }}>
        {/* Subtle bg glow */}
        <div style={{ position: 'absolute', top: '30%', left: '50%', transform: 'translate(-50%, -50%)', width: 600, height: 400, background: `radial-gradient(ellipse, ${T.accent}08 0%, transparent 70%)`, pointerEvents: 'none', zIndex: 0 }} />

        {!isSignedIn ? (
          /* Sign-in gate */
          <div style={{ textAlign: 'center', maxWidth: 440, position: 'relative', zIndex: 1 }}>
            <div style={{ fontFamily: T.mono, fontSize: 44, fontWeight: 700, color: T.accent, letterSpacing: 6, marginBottom: 8, textShadow: '0 0 40px #0ea5e930' }}>AXIOM</div>
            <div style={{ fontFamily: T.mono, fontSize: 11, color: T.muted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 28 }}>Institutional Equity Research</div>
            <div style={{ fontSize: 22, color: T.text, lineHeight: 1.4, marginBottom: 14, fontFamily: T.sans, fontWeight: 700, letterSpacing: '-0.02em' }}>
              Know if any stock is a Buy<br />or a Sell — in 60 seconds.
            </div>
            <div style={{ fontSize: 14, color: T.text2, lineHeight: 1.7, marginBottom: 24, fontFamily: T.sans }}>
              A full research report on any US stock: DCF valuation, Monte Carlo, comps, risks, and a clear recommendation — built from live SEC filings.
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 18, flexWrap: 'wrap', marginBottom: 30 }}>
              {['Free — no credit card', 'No API keys', 'Real SEC data'].map(t => (
                <span key={t} style={{ fontFamily: T.mono, fontSize: 10, color: T.muted2, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ color: T.green }}>✓</span>{t}
                </span>
              ))}
            </div>
            <SignInButton mode="modal">
              <button
                style={{ background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)', color: '#000', border: 'none', borderRadius: 10, padding: '15px 44px', fontFamily: T.mono, fontSize: 14, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.3, marginBottom: 14, boxShadow: '0 4px 20px #0ea5e930', transition: 'all 0.15s cubic-bezier(0.4,0,0.2,1)' }}
                onMouseEnter={e => { e.target.style.transform = 'scale(1.02)'; e.target.style.boxShadow = '0 6px 28px #0ea5e950' }}
                onMouseLeave={e => { e.target.style.transform = 'scale(1)'; e.target.style.boxShadow = '0 4px 20px #0ea5e930' }}
              >
                Create free account →
              </button>
            </SignInButton>
            <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted }}>Continue with Google · GitHub · X · Email</div>
            <div style={{ fontFamily: T.mono, fontSize: 9, color: T.muted, marginTop: 14, opacity: 0.6 }}>Your data is never stored or sold.</div>
          </div>
        ) : (
          <div style={{ width: '100%', maxWidth: 560, position: 'relative', zIndex: 1 }}>
            {/* Search area */}
            <div style={{ textAlign: 'center', marginBottom: 40 }}>
              {/* Label pill */}
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: T.accentLo, border: `1px solid ${T.accentBd}`, borderRadius: 99, padding: '5px 16px', marginBottom: 28 }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: T.accent, animation: 'pulse 2s infinite' }} />
                <span style={{ fontFamily: T.mono, fontSize: 11, color: T.accent, letterSpacing: 1.5, textTransform: 'uppercase' }}>Generate a report</span>
              </div>

              <form onSubmit={e => { e.preventDefault(); runAnalysis(ticker) }}>
                <div style={{
                  display: 'flex', gap: 0,
                  background: T.panel,
                  border: `1px solid ${inputFocused ? T.accentMid : loading ? T.accent + '66' : T.border2}`,
                  borderRadius: 12, overflow: 'hidden', marginBottom: 16,
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                  boxShadow: inputFocused ? `0 0 0 1px ${T.accent}30, 0 8px 32px ${T.accent}10` : loading ? `0 0 0 3px ${T.accent}12` : '0 4px 24px #00000020',
                }}>
                  <div style={{ padding: '0 18px', display: 'flex', alignItems: 'center', borderRight: `1px solid ${T.border}` }}>
                    <span style={{ fontFamily: T.mono, fontSize: 14, color: T.muted }}>$</span>
                  </div>
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder="Enter ticker symbol — AAPL, NVDA, MSFT..."
                    value={ticker}
                    onChange={e => setTicker(e.target.value.toUpperCase().replace(/[^A-Z.]/g, ''))}
                    disabled={loading || (usage && usage.remaining === 0)}
                    autoFocus
                    onFocus={() => setInputFocused(true)}
                    onBlur={() => setInputFocused(false)}
                    style={{ flex: 1, background: 'transparent', border: 'none', padding: '18px 18px', color: T.text, fontFamily: T.mono, fontSize: 16, outline: 'none' }}
                  />
                  <button
                    className="axiom-btn ax-analyze-btn"
                    type="submit"
                    onClick={e => { if (usage?.remaining === 0) { e.preventDefault(); setShowPaywall(true) } }}
                    disabled={loading || !ticker.trim()}
                    style={{
                      background: loading || !ticker.trim() ? T.bg3 : 'linear-gradient(135deg, #0ea5e9, #38bdf8)',
                      color: loading || !ticker.trim() ? T.muted : '#000',
                      border: 'none', padding: '0 28px',
                      fontFamily: T.mono, fontSize: 12, fontWeight: 700,
                      cursor: loading || !ticker.trim() ? 'not-allowed' : 'pointer',
                      letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 8,
                      boxShadow: loading || !ticker.trim() ? 'none' : '0 4px 20px #0ea5e930',
                      transition: 'all 0.15s cubic-bezier(0.4,0,0.2,1)', whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={e => { if (!loading && ticker.trim()) { e.currentTarget.style.boxShadow = '0 6px 28px #0ea5e950' } }}
                    onMouseLeave={e => { if (!loading && ticker.trim()) { e.currentTarget.style.boxShadow = '0 4px 20px #0ea5e930' } }}
                  >
                    {loading ? <><Spinner /> Running...</> : 'Analyze →'}
                  </button>
                </div>
              </form>

              {/* Progress */}
              {loading && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ height: 2, background: T.border, borderRadius: 1, overflow: 'hidden', marginBottom: 10 }}>
                    <div style={{ height: '100%', background: `linear-gradient(90deg, ${T.accent}, #38bdf8, ${T.accent})`, backgroundSize: '200% 100%', width: progressPct + '%', transition: 'width 0.5s ease', borderRadius: 1, animation: progressPct < 100 ? 'shimmer 1.5s linear infinite' : 'none' }} />
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: 11, color: T.accent, animation: 'pulse 1.5s infinite' }}>{progress}</div>
                </div>
              )}

              {error && (
                <div style={{ background: T.red + '10', border: `1px solid ${T.red}30`, borderRadius: 10, padding: '16px 20px', marginBottom: 16, textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ color: T.red, fontSize: 14 }}>⚠</span>
                    <div style={{ fontFamily: T.mono, fontSize: 10, color: T.red, textTransform: 'uppercase', letterSpacing: 1 }}>Error</div>
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: 12, color: T.muted2, lineHeight: 1.65, marginBottom: 12 }}>{error}</div>
                  {!error.includes('limit') && !error.includes('Sign in') && (
                    <button onClick={() => { setError(''); runAnalysis(currentTicker || ticker) }}
                      style={{ fontFamily: T.mono, fontSize: 11, color: T.text, background: T.bg3, border: `1px solid ${T.border2}`, borderRadius: 6, padding: '7px 16px', cursor: 'pointer', transition: 'all 0.15s' }}
                      onMouseEnter={e => { e.target.style.borderColor = T.border; e.target.style.background = T.panel }}
                      onMouseLeave={e => { e.target.style.borderColor = T.border2; e.target.style.background = T.bg3 }}
                    >↺ Try again</button>
                  )}
                </div>
              )}

              {usage?.remaining === 0 && (
                <button onClick={() => setShowPaywall(true)} style={{ width: '100%', background: T.accentLo, border: `1px solid ${T.accentBd}`, borderRadius: 8, padding: '13px 18px', fontFamily: T.mono, fontSize: 11, color: T.accent, marginBottom: 16, cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'all 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = `${T.accent}18`}
                  onMouseLeave={e => e.currentTarget.style.background = T.accentLo}
                >
                  <span>Monthly limit reached — Pro plan coming soon.</span>
                  <span style={{ color: T.muted2, flexShrink: 0, marginLeft: 8 }}>Join waitlist →</span>
                </button>
              )}

              {/* Popular tickers */}
              {!loading && (
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META', 'AMZN', 'TSLA', 'JPM'].map(t => (
                    <button key={t} onClick={() => { setTicker(t); runAnalysis(t) }}
                      style={{ fontFamily: T.mono, fontSize: 11, color: T.muted2, background: T.accentLo, border: `1px solid ${T.border}`, borderRadius: 99, padding: '5px 14px', cursor: 'pointer', transition: 'all 0.15s' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = T.accentBd; e.currentTarget.style.color = T.accent; e.currentTarget.style.background = `${T.accent}18` }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.muted2; e.currentTarget.style.background = T.accentLo }}
                    >{t}</button>
                  ))}
                </div>
              )}
            </div>

            {/* Recent reports */}
            {history.length > 0 && !loading && (
              <div>
                <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 14, textAlign: 'left' }}>
                  Recent reports
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {history.slice(0, 8).map(h => {
                    const rec = h.report?.structured?.recommendation
                    const recColor = REC_COLOR[rec]
                    const target = h.report?.structured?.targetPrice
                    return (
                      <button key={h.ticker}
                        onClick={() => { setReport(h.report); setCurrentTicker(h.ticker); setFinancials(h.report?.financials || null) }}
                        className="ax-history-item"
                        style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 10, padding: '14px 18px', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 16, transition: 'all 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = T.accentBd; e.currentTarget.style.background = T.panelHov; e.currentTarget.style.boxShadow = `inset 3px 0 0 ${T.accent}` }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.panel; e.currentTarget.style.boxShadow = 'none' }}
                      >
                        <div style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 700, color: T.text, minWidth: 54 }}>{h.ticker}</div>
                        <div style={{ flex: 1, fontFamily: T.sans, fontSize: 12, color: T.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {h.report?.financials?.companyName || ''}
                        </div>
                        {target && <div style={{ fontFamily: T.mono, fontSize: 11, color: T.muted2, flexShrink: 0 }}>${Math.round(target)}</div>}
                        {rec && (
                          <div style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 700, color: recColor, background: recColor + '18', border: `1px solid ${recColor}35`, borderRadius: 5, padding: '3px 9px', letterSpacing: 0.8, flexShrink: 0 }}>{rec}</div>
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

      {/* Paywall modal */}
      {showPaywall && (
        <div onClick={() => setShowPaywall(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.panel, border: `1px solid ${T.border2}`, borderRadius: 16, padding: 'clamp(24px,5vw,36px)', maxWidth: 420, width: '100%', boxShadow: `0 24px 80px #000a, 0 0 0 1px ${T.accentBd}`, animation: 'modalIn 0.2s ease' }}>
            <div style={{ fontFamily: T.mono, fontSize: 9, color: T.accent, background: T.accentLo, border: `1px solid ${T.accentBd}`, borderRadius: 4, padding: '3px 10px', letterSpacing: 1.5, display: 'inline-block', marginBottom: 20 }}>PRO PLAN</div>
            <div style={{ fontFamily: T.sans, fontSize: 22, fontWeight: 800, color: T.text, letterSpacing: -0.5, marginBottom: 8, lineHeight: 1.3 }}>
              You've used your {FREE_LIMIT} free reports
            </div>
            <div style={{ fontFamily: T.sans, fontSize: 14, color: T.text2, lineHeight: 1.6, marginBottom: 24 }}>
              Pro gives you unlimited reports, priority data, and advanced export features. Join the waitlist and you'll be first to know when it launches.
            </div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
              {[['Unlimited reports', T.green], ['Priority queue', T.accent], ['Advanced PDF', T.gold]].map(([label, color]) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <span style={{ fontFamily: T.mono, fontSize: 10, color: T.text2 }}>{label}</span>
                </div>
              ))}
            </div>
            {waitlistSent ? (
              <div style={{ background: T.green + '15', border: `1px solid ${T.green}40`, borderRadius: 10, padding: '16px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>✓</div>
                <div style={{ fontFamily: T.mono, fontSize: 12, color: T.green }}>You're on the list!</div>
                <div style={{ fontFamily: T.sans, fontSize: 12, color: T.text2, marginTop: 4 }}>We'll email you when Pro launches.</div>
              </div>
            ) : (
              <form onSubmit={submitWaitlist}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="email"
                    placeholder="your@email.com"
                    value={waitlistEmail}
                    onChange={e => setWaitlistEmail(e.target.value)}
                    required
                    style={{ flex: 1, background: T.bg3, border: `1px solid ${T.border2}`, borderRadius: 8, padding: '11px 14px', color: T.text, fontFamily: T.mono, fontSize: 13, outline: 'none', minWidth: 0 }}
                    onFocus={e => e.target.style.borderColor = T.accentMid}
                    onBlur={e => e.target.style.borderColor = T.border2}
                  />
                  <button type="submit" disabled={waitlistLoading} style={{ background: 'linear-gradient(135deg,#0ea5e9,#38bdf8)', color: '#000', border: 'none', borderRadius: 8, padding: '11px 18px', fontFamily: T.mono, fontSize: 12, fontWeight: 700, cursor: waitlistLoading ? 'wait' : 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {waitlistLoading ? '...' : 'Join →'}
                  </button>
                </div>
              </form>
            )}
            <div style={{ marginTop: 16, fontFamily: T.mono, fontSize: 10, color: T.muted, textAlign: 'center' }}>
              Resets {new Date(usage?.resetAt || Date.now()).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} · No spam, ever.
            </div>
            <button onClick={() => setShowPaywall(false)} style={{ position: 'absolute', display: 'none' }} />
          </div>
        </div>
      )}

      {/* Status bar */}
      <footer className="ax-footer" style={{ height: 32, borderTop: `1px solid ${T.border}`, background: T.bg2, display: 'flex', alignItems: 'center', padding: '0 28px', gap: 20, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: T.green, boxShadow: `0 0 6px ${T.green}`, animation: 'pulse 2s infinite' }} />
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
