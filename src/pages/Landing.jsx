import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import ResearchReport from '../components/ResearchReport.jsx'
import { SignInButton, SignUpButton, UserButton, useUser } from '@clerk/clerk-react'

const C = {
  bg: '#0a0a0a', panel: '#111', border: '#1e1e1e', border2: '#252525',
  accent: '#38bdf8', negative: '#f87171', positive: '#22c55e',
  muted: '#4b5563', muted2: '#6b7280',
  mono: "'IBM Plex Mono', monospace", sans: "'Inter', sans-serif",
}

const POPULAR = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META', 'AMZN', 'TSLA', 'JPM']

const FEATURES = [
  {
    icon: '⬡',
    title: 'Live SEC EDGAR Data',
    desc: 'Revenue, margins, FCF, balance sheet — sourced directly from official 10-K filings. No data vendors, no lag, no stale PDFs.',
  },
  {
    icon: '◎',
    title: 'Two-Pass AI Analysis',
    desc: 'Chain-of-thought reasoning followed by structured JSON extraction. Deep analysis, machine-readable output.',
  },
  {
    icon: '◈',
    title: 'DCF + Monte Carlo',
    desc: '8-year two-stage DCF model. 2,000 Monte Carlo trials showing the full value distribution with P10–P90 range.',
  },
  {
    icon: '◇',
    title: 'Comparable Company Analysis',
    desc: 'AI-generated comps table with EV/EBITDA, P/E, revenue growth, and gross margin for peer benchmarking.',
  },
  {
    icon: '◻',
    title: 'Altman Z & Piotroski F',
    desc: 'Bankruptcy risk score and 9-point fundamental quality screen — quantitative signals, not just narrative.',
  },
  {
    icon: '◬',
    title: 'Export to PDF',
    desc: 'One-click PDF export formatted for printing and sharing. No watermarks. No paywalled pages.',
  },
]

function Spinner() {
  return (
    <div style={{
      display: 'inline-block', width: 14, height: 14,
      border: `2px solid #38bdf840`, borderTopColor: '#38bdf8',
      borderRadius: '50%', animation: 'spin 0.7s linear infinite',
    }} />
  )
}

const clerkEnabled = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

function AuthNav({ C }) {
  const { isSignedIn } = useUser()
  if (isSignedIn) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <UserButton afterSignOutUrl="/" appearance={{ variables: { colorPrimary: '#38bdf8' } }} />
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <SignInButton mode="modal">
        <button style={{
          fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: '#6b7280',
          background: 'transparent', border: '1px solid #1e1e1e',
          borderRadius: 5, padding: '7px 16px', cursor: 'pointer',
        }}>
          Sign in
        </button>
      </SignInButton>
      <SignUpButton mode="modal">
        <button style={{
          fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: '#000',
          background: '#38bdf8', border: 'none',
          borderRadius: 5, padding: '7px 16px', cursor: 'pointer', fontWeight: 700,
        }}>
          Sign up
        </button>
      </SignUpButton>
    </div>
  )
}

export default function Landing() {
  const navigate = useNavigate()
  const [ticker, setTicker] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [progressPct, setProgressPct] = useState(0)
  const [error, setError] = useState('')
  const [report, setReport] = useState(null)
  const [financials, setFinancials] = useState(null)
  const [currentTicker, setCurrentTicker] = useState('')
  const inputRef = useRef(null)

  async function runDemo(t) {
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
      setProgressPct(40)

      setProgress('Generating AI analysis...')
      const aiRes = await fetch('/api/demo-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: sym, financials: edgarData.financials }),
      })
      const aiData = await aiRes.json()
      if (!aiRes.ok) {
        if (aiData.limitReached) {
          throw new Error('Demo limit reached (1 per 24h). Use your own free Groq key in the app for unlimited access.')
        }
        throw new Error(aiData.error || 'Analysis failed')
      }

      setProgressPct(100)
      setReport(aiData)
      setCurrentTicker(sym)
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
    runDemo(ticker)
  }

  if (report) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, color: '#e5e5e5', fontFamily: C.sans }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } } @keyframes fadeIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }`}</style>
        {/* Demo banner */}
        <div style={{
          background: C.accent + '12', borderBottom: `1px solid ${C.accent}30`,
          padding: '10px 24px', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', flexWrap: 'wrap', gap: 10,
        }}>
          <div style={{ fontFamily: C.mono, fontSize: 11, color: C.accent }}>
            Demo · Groq llama-3.3-70b · 1 free report per day
            <span style={{ color: C.muted2, marginLeft: 12 }}>Want unlimited? Use your own free API key.</span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => { setReport(null); setTicker(''); setTimeout(() => inputRef.current?.focus(), 50) }}
              style={{ fontFamily: C.mono, fontSize: 11, color: C.muted2, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 4, padding: '5px 12px', cursor: 'pointer' }}
            >
              ← Back
            </button>
            <button
              onClick={() => navigate('/app')}
              style={{ fontFamily: C.mono, fontSize: 11, color: '#000', background: C.accent, border: 'none', borderRadius: 4, padding: '5px 14px', cursor: 'pointer', fontWeight: 700 }}
            >
              Use your own key →
            </button>
          </div>
        </div>
        <div style={{ animation: 'fadeIn 0.3s ease' }}>
          <ResearchReport ticker={currentTicker} financials={financials || {}} result={report} />
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: '#e5e5e5', fontFamily: C.sans }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }
      `}</style>

      {/* ── NAV ── */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 32px', height: 56, borderBottom: `1px solid ${C.border}`,
        position: 'sticky', top: 0, background: C.bg + 'f0',
        backdropFilter: 'blur(12px)', zIndex: 10,
      }}>
        <div style={{ fontFamily: C.mono, fontSize: 15, fontWeight: 700, color: C.accent, letterSpacing: 3 }}>AXIOM</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {clerkEnabled ? <AuthNav C={C} /> : null}
          <button
            onClick={() => navigate('/app')}
            style={{
              fontFamily: C.mono, fontSize: 12, color: C.muted2, background: 'transparent',
              border: `1px solid ${C.border}`, borderRadius: 5, padding: '7px 18px',
              cursor: 'pointer', transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { e.target.style.borderColor = C.accent + '66'; e.target.style.color = C.accent }}
            onMouseLeave={e => { e.target.style.borderColor = C.border; e.target.style.color = C.muted2 }}
          >
            Launch App →
          </button>
        </div>
      </nav>

      {/* ── HERO ── */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '96px 24px 0', textAlign: 'center' }}>
        <div style={{
          display: 'inline-block', fontFamily: C.mono, fontSize: 10, color: C.accent,
          background: C.accent + '12', border: `1px solid ${C.accent}30`,
          padding: '5px 16px', borderRadius: 20, letterSpacing: 2, marginBottom: 28,
          textTransform: 'uppercase',
        }}>
          Institutional Equity Research · Powered by SEC EDGAR
        </div>

        <h1 style={{
          fontSize: 60, fontWeight: 800, color: '#fff', letterSpacing: -2.5,
          lineHeight: 1.05, margin: '0 0 20px',
        }}>
          Research any stock<br />
          <span style={{ color: C.accent }}>in 60 seconds.</span>
        </h1>

        <p style={{
          fontSize: 17, color: C.muted2, lineHeight: 1.75, margin: '0 auto 52px',
          maxWidth: 540,
        }}>
          Live SEC EDGAR filings. Two-pass AI analysis. DCF model, Monte Carlo simulation,
          Altman Z-Score, comps table — institutional-grade output, zero subscription.
        </p>

        {/* ── DEMO FORM ── */}
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <input
              ref={inputRef}
              type="text"
              placeholder="Enter a ticker — AAPL, NVDA, MSFT..."
              value={ticker}
              onChange={e => setTicker(e.target.value.toUpperCase().replace(/[^A-Z.]/g, ''))}
              disabled={loading}
              style={{
                flex: 1, background: '#111',
                border: `1px solid ${loading ? C.accent + '44' : C.border}`,
                borderRadius: 8, padding: '15px 18px', color: '#e5e5e5',
                fontFamily: C.mono, fontSize: 15, outline: 'none',
                transition: 'border-color 0.15s',
              }}
            />
            <button
              type="submit"
              disabled={loading || !ticker.trim()}
              style={{
                background: loading || !ticker.trim() ? '#1a1a1a' : C.accent,
                color: loading || !ticker.trim() ? C.muted : '#000',
                border: 'none', borderRadius: 8, padding: '15px 22px',
                fontFamily: C.mono, fontSize: 13, fontWeight: 700,
                cursor: loading || !ticker.trim() ? 'not-allowed' : 'pointer',
                letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 8,
                whiteSpace: 'nowrap', transition: 'background 0.15s',
              }}
            >
              {loading ? <><Spinner /> Analyzing</> : 'Try free →'}
            </button>
          </form>

          {/* Progress bar */}
          {loading && (
            <div style={{ marginBottom: 14 }}>
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
              background: '#f8717115', border: '1px solid #f8717130',
              borderRadius: 8, padding: '12px 16px',
              fontFamily: C.mono, fontSize: 12, color: C.negative,
              textAlign: 'left', marginBottom: 14,
            }}>
              <strong>Error:</strong> {error}
              {error.includes('limit reached') && (
                <div style={{ marginTop: 8 }}>
                  <button
                    onClick={() => navigate('/app')}
                    style={{ fontFamily: C.mono, fontSize: 11, color: C.accent, background: 'transparent', border: `1px solid ${C.accent}44`, borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}
                  >
                    Use your own free key →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Popular tickers */}
          {!loading && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontFamily: C.mono, fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 }}>
                Try these
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
                {POPULAR.map(t => (
                  <button
                    key={t}
                    onClick={() => { setTicker(t); runDemo(t) }}
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

          <div style={{ marginTop: 22, display: 'flex', justifyContent: 'center', gap: 20, fontFamily: C.mono, fontSize: 10, color: C.muted }}>
            <span>1 free demo / day</span>
            <span>·</span>
            <span>No signup required</span>
            <span>·</span>
            <span>Real SEC EDGAR data</span>
          </div>
        </div>
      </div>

      {/* ── FEATURES ── */}
      <div style={{ maxWidth: 980, margin: '112px auto 0', padding: '0 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 52 }}>
          <div style={{ fontFamily: C.mono, fontSize: 10, color: C.accent, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 14 }}>
            What's in every report
          </div>
          <h2 style={{ fontSize: 38, fontWeight: 700, color: '#fff', letterSpacing: -1.2, margin: 0, lineHeight: 1.15 }}>
            Institutional-grade analysis.<br />For everyone.
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          {FEATURES.map((f, i) => (
            <div key={i} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: '24px 26px' }}>
              <div style={{ fontFamily: C.mono, fontSize: 22, color: C.accent, marginBottom: 14 }}>{f.icon}</div>
              <div style={{ fontFamily: C.sans, fontSize: 15, fontWeight: 600, color: '#e5e5e5', marginBottom: 8 }}>{f.title}</div>
              <div style={{ fontSize: 13, color: C.muted2, lineHeight: 1.7 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── HOW IT WORKS ── */}
      <div style={{ maxWidth: 720, margin: '112px auto 0', padding: '0 24px', textAlign: 'center' }}>
        <div style={{ fontFamily: C.mono, fontSize: 10, color: C.accent, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 14 }}>
          How it works
        </div>
        <h2 style={{ fontSize: 38, fontWeight: 700, color: '#fff', letterSpacing: -1.2, margin: '0 0 52px', lineHeight: 1.15 }}>
          Three steps. 60 seconds.
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 40 }}>
          {[
            { n: '01', title: 'Enter a ticker', desc: 'Type any US-listed company ticker. NYSE, NASDAQ, or OTC.' },
            { n: '02', title: 'We fetch the filings', desc: 'Live XBRL data pulled directly from SEC EDGAR. Always current.' },
            { n: '03', title: 'Get your report', desc: 'Full DCF, comps, risk matrix, and investment recommendation in under a minute.' },
          ].map((step, i) => (
            <div key={i}>
              <div style={{ fontFamily: C.mono, fontSize: 36, fontWeight: 700, color: C.accent + '35', marginBottom: 14 }}>{step.n}</div>
              <div style={{ fontFamily: C.sans, fontSize: 15, fontWeight: 600, color: '#e5e5e5', marginBottom: 8 }}>{step.title}</div>
              <div style={{ fontSize: 13, color: C.muted2, lineHeight: 1.7 }}>{step.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── PRICING ── */}
      <div style={{ maxWidth: 760, margin: '112px auto 0', padding: '0 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 44 }}>
          <div style={{ fontFamily: C.mono, fontSize: 10, color: C.accent, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 14 }}>
            Pricing
          </div>
          <h2 style={{ fontSize: 38, fontWeight: 700, color: '#fff', letterSpacing: -1.2, margin: 0 }}>
            Start free. Always.
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Free / BYOK */}
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: '32px 28px' }}>
            <div style={{ fontFamily: C.mono, fontSize: 10, color: C.muted2, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 }}>Free · BYOK</div>
            <div style={{ fontFamily: C.mono, fontSize: 40, fontWeight: 700, color: '#fff', marginBottom: 6 }}>$0</div>
            <div style={{ fontSize: 13, color: C.muted2, marginBottom: 28, lineHeight: 1.6 }}>
              Bring your own API key. Unlimited reports, zero cost.
            </div>
            {[
              'Unlimited reports',
              'Groq (free), Anthropic, OpenAI, OpenRouter',
              'Full DCF + Monte Carlo simulation',
              'Altman Z-Score + Piotroski F-Score',
              'PDF export',
            ].map(f => (
              <div key={f} style={{ display: 'flex', gap: 10, marginBottom: 10, fontSize: 13, color: '#9ca3af' }}>
                <span style={{ color: C.positive, flexShrink: 0 }}>✓</span> {f}
              </div>
            ))}
            <button
              onClick={() => navigate('/app')}
              style={{
                display: 'block', width: '100%', marginTop: 28,
                background: 'transparent', color: C.accent,
                border: `1px solid ${C.accent}44`, borderRadius: 7,
                padding: '13px 0', fontFamily: C.mono, fontSize: 13,
                fontWeight: 600, cursor: 'pointer', transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.target.style.background = C.accent + '12'}
              onMouseLeave={e => e.target.style.background = 'transparent'}
            >
              Launch app →
            </button>
          </div>

          {/* Pro — coming soon */}
          <div style={{ background: C.panel, border: `1px solid ${C.accent}44`, borderRadius: 12, padding: '32px 28px', position: 'relative' }}>
            <div style={{
              position: 'absolute', top: -1, right: 20,
              background: C.accent, color: '#000',
              fontFamily: C.mono, fontSize: 9, fontWeight: 700,
              padding: '4px 10px', borderRadius: '0 0 6px 6px', letterSpacing: 1,
            }}>
              COMING SOON
            </div>
            <div style={{ fontFamily: C.mono, fontSize: 10, color: C.accent, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 }}>Pro</div>
            <div style={{ fontFamily: C.mono, fontSize: 40, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
              $49<span style={{ fontSize: 14, fontWeight: 400, color: C.muted2 }}>/mo</span>
            </div>
            <div style={{ fontSize: 13, color: C.muted2, marginBottom: 28, lineHeight: 1.6 }}>
              No API key needed. We handle everything.
            </div>
            {[
              'Unlimited reports — no API key',
              'Cloud report history',
              'Shareable report links',
              'Priority AI (Claude Opus 4.8)',
              'Team accounts (3 seats)',
            ].map(f => (
              <div key={f} style={{ display: 'flex', gap: 10, marginBottom: 10, fontSize: 13, color: '#9ca3af' }}>
                <span style={{ color: C.positive, flexShrink: 0 }}>✓</span> {f}
              </div>
            ))}
            <button disabled style={{
              display: 'block', width: '100%', marginTop: 28,
              background: C.accent + '20', color: C.muted,
              border: 'none', borderRadius: 7, padding: '13px 0',
              fontFamily: C.mono, fontSize: 13, fontWeight: 600,
              cursor: 'not-allowed',
            }}>
              Coming soon
            </button>
          </div>
        </div>
      </div>

      {/* ── BOTTOM CTA ── */}
      <div style={{ maxWidth: 600, margin: '112px auto 0', padding: '0 24px 80px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 44, fontWeight: 800, color: '#fff', letterSpacing: -1.5, margin: '0 0 16px', lineHeight: 1.1 }}>
          Try it now.<br />No signup. No card.
        </h2>
        <p style={{ fontSize: 15, color: C.muted2, margin: '0 0 36px', lineHeight: 1.7 }}>
          Enter a ticker above, or launch the full app with your own free API key.
        </p>
        <button
          onClick={() => navigate('/app')}
          style={{
            background: C.accent, color: '#000', fontFamily: C.mono,
            fontSize: 14, fontWeight: 700, padding: '14px 36px',
            borderRadius: 8, border: 'none', cursor: 'pointer',
            letterSpacing: 0.5, transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => e.target.style.opacity = '0.85'}
          onMouseLeave={e => e.target.style.opacity = '1'}
        >
          Launch AXIOM →
        </button>
      </div>

      {/* ── FOOTER ── */}
      <div style={{
        borderTop: `1px solid ${C.border}`, padding: '20px 32px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.muted }}>AXIOM · Institutional Equity Research</div>
        <div style={{ fontFamily: C.mono, fontSize: 10, color: C.muted }}>
          Data: SEC EDGAR · Keys stored in your browser only · Zero server-side storage
        </div>
      </div>
    </div>
  )
}
