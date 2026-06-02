import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import ResearchReport from '../components/ResearchReport.jsx'
import { SignInButton, SignUpButton, UserButton, useUser } from '@clerk/clerk-react'

// ─── Design Tokens ───────────────────────────────────────────────────────────
const T = {
  bg:       '#05080f',
  bg2:      '#080d16',
  bg3:      '#0c1220',
  panel:    '#0e1525',
  border:   '#1a2640',
  border2:  '#243350',
  accent:   '#0ea5e9',
  accentLo: '#0ea5e912',
  accentBd: '#0ea5e938',
  green:    '#10b981',
  red:      '#ef4444',
  gold:     '#f59e0b',
  text:     '#e2e8f0',
  muted:    '#4a6080',
  muted2:   '#7a90a8',
  mono:     "'IBM Plex Mono', monospace",
  sans:     "'Inter', sans-serif",
}

const clerkEnabled = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

// ─── Reusable Components ─────────────────────────────────────────────────────

function Spinner() {
  return <div style={{ display: 'inline-block', width: 13, height: 13, border: `2px solid ${T.accent}30`, borderTopColor: T.accent, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
}

function Badge({ children, color = T.accent }) {
  return (
    <span style={{ fontFamily: T.mono, fontSize: 10, fontWeight: 700, color, background: color + '18', border: `1px solid ${color}35`, borderRadius: 4, padding: '3px 8px', letterSpacing: 0.8, textTransform: 'uppercase' }}>
      {children}
    </span>
  )
}

function RecBadge({ rec }) {
  const color = rec === 'BUY' ? T.green : rec === 'SELL' ? T.red : T.gold
  return <Badge color={color}>{rec}</Badge>
}

function SectionLabel({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, justifyContent: 'center' }}>
      <div style={{ width: 24, height: 1, background: T.accentBd }} />
      <span style={{ fontFamily: T.mono, fontSize: 10, color: T.accent, letterSpacing: 2, textTransform: 'uppercase' }}>{children}</span>
      <div style={{ width: 24, height: 1, background: T.accentBd }} />
    </div>
  )
}

function Metric({ label, value, color = T.text, sub }) {
  return (
    <div style={{ padding: '14px 16px', background: T.bg3, border: `1px solid ${T.border}`, borderRadius: 6 }}>
      <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: T.mono, fontSize: 18, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted2, marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function Sparkline({ data, color = T.accent, width = 80, height = 28 }) {
  const min = Math.min(...data), max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * height
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function FakeProgress({ pct, label, color = T.accent }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontFamily: T.mono, fontSize: 11, color: T.muted2 }}>{label}</span>
        <span style={{ fontFamily: T.mono, fontSize: 11, color }}>{pct}%</span>
      </div>
      <div style={{ height: 3, background: T.border, borderRadius: 2 }}>
        <div style={{ width: pct + '%', height: '100%', background: color, borderRadius: 2 }} />
      </div>
    </div>
  )
}

// ─── Ticker Strip ─────────────────────────────────────────────────────────────
const TICKERS = [
  { sym: 'AAPL', chg: +1.24, price: 213.48 }, { sym: 'NVDA', chg: +3.81, price: 875.20 },
  { sym: 'MSFT', chg: -0.42, price: 418.73 }, { sym: 'GOOGL', chg: +0.97, price: 182.91 },
  { sym: 'META', chg: +2.13, price: 521.34 }, { sym: 'AMZN', chg: -0.88, price: 195.67 },
  { sym: 'TSLA', chg: -1.54, price: 248.10 }, { sym: 'JPM', chg: +0.66, price: 209.84 },
  { sym: 'BRK.B', chg: +0.31, price: 437.22 }, { sym: 'V', chg: +0.52, price: 289.45 },
  { sym: 'NFLX', chg: +1.78, price: 684.30 }, { sym: 'AMD', chg: -2.11, price: 163.48 },
]

function TickerStrip() {
  const items = [...TICKERS, ...TICKERS]
  return (
    <div style={{ overflow: 'hidden', borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}`, background: T.bg2, padding: '10px 0' }}>
      <div style={{ display: 'flex', animation: 'ticker 40s linear infinite', width: 'max-content' }}>
        {items.map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 32px', borderRight: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>
            <span style={{ fontFamily: T.mono, fontSize: 12, fontWeight: 700, color: T.text }}>{t.sym}</span>
            <span style={{ fontFamily: T.mono, fontSize: 12, color: T.muted2 }}>${t.price.toFixed(2)}</span>
            <span style={{ fontFamily: T.mono, fontSize: 11, color: t.chg >= 0 ? T.green : T.red }}>
              {t.chg >= 0 ? '+' : ''}{t.chg.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Hero Report Mockup ───────────────────────────────────────────────────────
function ReportMockup() {
  const sp = [142, 148, 145, 152, 158, 155, 161, 168, 165, 172, 178, 181]
  return (
    <div style={{ background: T.panel, border: `1px solid ${T.border2}`, borderRadius: 12, overflow: 'hidden', boxShadow: `0 32px 80px #00000080, 0 0 0 1px ${T.border}`, maxWidth: 580, margin: '0 auto' }}>
      {/* Report header */}
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ fontFamily: T.mono, fontSize: 16, fontWeight: 700, color: T.text }}>NVDA</span>
            <span style={{ fontFamily: T.mono, fontSize: 11, color: T.muted2 }}>NVIDIA Corporation</span>
          </div>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted }}>Generated in 47s · SEC EDGAR · FY 2024</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <RecBadge rec="BUY" />
          <div style={{ fontFamily: T.mono, fontSize: 11, color: T.muted2, marginTop: 6 }}>Target <span style={{ color: T.green }}>$980</span> · +11.9%</div>
        </div>
      </div>
      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: T.border, margin: '1px' }}>
        {[
          { label: 'Revenue', value: '$60.9B', sub: '+122% YoY' },
          { label: 'EBITDA Margin', value: '62.1%', sub: '+18pp YoY' },
          { label: 'FCF', value: '$27.0B', sub: '44.3% margin' },
          { label: 'P/E', value: '34.2x', sub: 'vs 28.1x peers' },
        ].map(m => (
          <div key={m.label} style={{ background: T.panel, padding: '12px 14px' }}>
            <div style={{ fontFamily: T.mono, fontSize: 9, color: T.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 }}>{m.label}</div>
            <div style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 700, color: T.text }}>{m.value}</div>
            <div style={{ fontFamily: T.mono, fontSize: 9, color: T.green, marginTop: 3 }}>{m.sub}</div>
          </div>
        ))}
      </div>
      {/* Body */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: 16 }}>
        {/* DCF */}
        <div style={{ background: T.bg3, border: `1px solid ${T.border}`, borderRadius: 8, padding: '14px' }}>
          <div style={{ fontFamily: T.mono, fontSize: 9, color: T.accent, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>DCF Valuation</div>
          {[['WACC', '9.2%'], ['EBITDA Growth', '18.0% → 7.0%'], ['Terminal Growth', '2.5%'], ['Intrinsic Value', '$946']].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontFamily: T.mono, fontSize: 10 }}>
              <span style={{ color: T.muted2 }}>{k}</span>
              <span style={{ color: T.text, fontWeight: 600 }}>{v}</span>
            </div>
          ))}
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
            <FakeProgress pct={72} label="P10 – P90" color={T.green} />
          </div>
        </div>
        {/* Risk + sparkline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ background: T.bg3, border: `1px solid ${T.border}`, borderRadius: 8, padding: '14px', flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontFamily: T.mono, fontSize: 9, color: T.accent, textTransform: 'uppercase', letterSpacing: 1.5 }}>Risk Matrix</div>
            </div>
            {[['Competitive moat erosion', 'HIGH'], ['Export controls', 'MED'], ['Valuation premium', 'MED'], ['Supply chain', 'LOW']].map(([r, s]) => (
              <div key={r} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                <span style={{ fontFamily: T.mono, fontSize: 9, color: T.muted2 }}>{r}</span>
                <span style={{ fontFamily: T.mono, fontSize: 8, color: s === 'HIGH' ? T.red : s === 'MED' ? T.gold : T.green, background: (s === 'HIGH' ? T.red : s === 'MED' ? T.gold : T.green) + '18', padding: '2px 6px', borderRadius: 3, fontWeight: 700 }}>{s}</span>
              </div>
            ))}
          </div>
          <div style={{ background: T.bg3, border: `1px solid ${T.border}`, borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontFamily: T.mono, fontSize: 9, color: T.muted2, textTransform: 'uppercase', letterSpacing: 1 }}>Revenue 12M</span>
              <span style={{ fontFamily: T.mono, fontSize: 10, color: T.green }}>+122%</span>
            </div>
            <Sparkline data={sp} color={T.green} width={160} height={32} />
          </div>
        </div>
      </div>
      {/* Analyst note */}
      <div style={{ padding: '12px 16px 16px', borderTop: `1px solid ${T.border}` }}>
        <div style={{ fontFamily: T.mono, fontSize: 9, color: T.accent, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>Analyst Note</div>
        <div style={{ fontSize: 12, color: T.muted2, lineHeight: 1.65, fontStyle: 'italic' }}>
          "NVIDIA's data center segment delivered 217% growth to $47.5B. At 34.2x forward P/E against 62% EBITDA margins, the premium is justified. Initiating at BUY with $980 target."
        </div>
      </div>
    </div>
  )
}

// ─── Nav ─────────────────────────────────────────────────────────────────────
function Nav({ navigate }) {
  const { isSignedIn } = useUser()
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', fn)
    return () => window.removeEventListener('scroll', fn)
  }, [])

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 32px', height: 58,
      background: scrolled ? T.bg + 'f5' : 'transparent',
      borderBottom: scrolled ? `1px solid ${T.border}` : '1px solid transparent',
      backdropFilter: scrolled ? 'blur(16px)' : 'none',
      transition: 'all 0.2s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
        <div style={{ fontFamily: T.mono, fontSize: 16, fontWeight: 700, color: T.accent, letterSpacing: 4 }}>AXIOM</div>
        <div style={{ display: 'flex', gap: 28 }}>
          {['Features', 'Pricing', 'FAQ'].map(item => (
            <a key={item} href={`#${item.toLowerCase()}`} style={{ fontFamily: T.sans, fontSize: 13, color: T.muted2, textDecoration: 'none', transition: 'color 0.15s' }}
              onMouseEnter={e => e.target.style.color = T.text}
              onMouseLeave={e => e.target.style.color = T.muted2}
            >{item}</a>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {clerkEnabled && !isSignedIn && (
          <>
            <SignInButton mode="modal">
              <button style={{ fontFamily: T.mono, fontSize: 12, color: T.muted2, background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px 4px', transition: 'color 0.15s' }}
                onMouseEnter={e => e.target.style.color = T.text}
                onMouseLeave={e => e.target.style.color = T.muted2}
              >Sign in</button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button style={{ fontFamily: T.mono, fontSize: 12, color: '#000', background: T.accent, border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontWeight: 700, letterSpacing: 0.3 }}>
                Get started free
              </button>
            </SignUpButton>
          </>
        )}
        {clerkEnabled && isSignedIn && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <UserButton afterSignOutUrl="/" />
          </div>
        )}
      </div>
    </nav>
  )
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
function Hero({ navigate, runDemo, ticker, setTicker, loading, progress, progressPct, error }) {
  const inputRef = useRef(null)
  const { isSignedIn } = useUser()
  const POPULAR = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META', 'AMZN']

  function handleGenerate(t) {
    if (!t?.trim()) return
    const sym = t.trim().toUpperCase()
    if (isSignedIn) {
      navigate(`/app?q=${sym}`)
    } else {
      runDemo(sym)
    }
  }

  return (
    <section style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '120px 24px 80px', position: 'relative', overflow: 'hidden' }}>
      {/* Grid background */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(${T.accentBd}18 1px, transparent 1px), linear-gradient(90deg, ${T.accentBd}18 1px, transparent 1px)`, backgroundSize: '48px 48px', zIndex: 0 }} />
      {/* Glow */}
      <div style={{ position: 'absolute', top: '30%', left: '50%', transform: 'translate(-50%, -50%)', width: 600, height: 400, background: `radial-gradient(ellipse, ${T.accent}12 0%, transparent 70%)`, zIndex: 0 }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1100, margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center' }}>
          {/* Left: copy */}
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: T.accentLo, border: `1px solid ${T.accentBd}`, borderRadius: 20, padding: '5px 14px', marginBottom: 28 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.green, boxShadow: `0 0 6px ${T.green}` }} />
              <span style={{ fontFamily: T.mono, fontSize: 11, color: T.accent, letterSpacing: 1.5, textTransform: 'uppercase' }}>Live · SEC EDGAR Data</span>
            </div>

            <h1 style={{ fontSize: 54, fontWeight: 800, color: T.text, letterSpacing: -2, lineHeight: 1.05, margin: '0 0 20px', fontFamily: T.sans }}>
              Institutional equity<br />research.<br />
              <span style={{ color: T.accent }}>Generated in 60s.</span>
            </h1>

            <p style={{ fontSize: 16, color: T.muted2, lineHeight: 1.75, margin: '0 0 36px', maxWidth: 440 }}>
              AXIOM turns live SEC EDGAR filings into complete investment reports — DCF modeling, Monte Carlo simulation, comps, risk scoring, and a BUY / HOLD / SELL recommendation.
            </p>

            {/* Input */}
            <div style={{ maxWidth: 440 }}>
              <form onSubmit={e => { e.preventDefault(); handleGenerate(ticker) }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 0, background: T.panel, border: `1px solid ${loading ? T.accent + '66' : T.border2}`, borderRadius: 8, overflow: 'hidden', transition: 'border-color 0.15s' }}>
                    <span style={{ fontFamily: T.mono, fontSize: 12, color: T.muted, padding: '0 12px' }}>$</span>
                    <input
                      ref={inputRef}
                      type="text"
                      placeholder="AAPL, NVDA, MSFT..."
                      value={ticker}
                      onChange={e => setTicker(e.target.value.toUpperCase().replace(/[^A-Z.]/g, ''))}
                      disabled={loading}
                      style={{ flex: 1, background: 'transparent', border: 'none', padding: '14px 12px 14px 0', color: T.text, fontFamily: T.mono, fontSize: 15, outline: 'none' }}
                    />
                  </div>
                  <button type="submit" disabled={loading || !ticker.trim()} style={{
                    background: loading || !ticker.trim() ? T.bg3 : T.accent,
                    color: loading || !ticker.trim() ? T.muted : '#000',
                    border: 'none', borderRadius: 8, padding: '14px 22px',
                    fontFamily: T.mono, fontSize: 13, fontWeight: 700,
                    cursor: loading || !ticker.trim() ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 8,
                    transition: 'all 0.15s',
                  }}>
                    {loading ? <><Spinner /> Running...</> : isSignedIn ? 'Analyze →' : 'Preview →'}
                  </button>
                </div>
              </form>

              {loading && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ height: 2, background: T.border, borderRadius: 1, overflow: 'hidden', marginBottom: 8 }}>
                    <div style={{ height: '100%', background: T.accent, width: progressPct + '%', transition: 'width 0.5s ease', borderRadius: 1 }} />
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: 11, color: T.accent, animation: 'pulse 1.5s infinite' }}>{progress}</div>
                </div>
              )}

              {error && !error.includes('limit') && (
                <div style={{ background: T.red + '12', border: `1px solid ${T.red}30`, borderRadius: 6, padding: '10px 14px', fontFamily: T.mono, fontSize: 11, color: T.red, marginBottom: 12 }}>{error}</div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontFamily: T.mono, fontSize: 10, color: T.muted }}>Try:</span>
                {POPULAR.map(t => (
                  <button key={t} onClick={() => { setTicker(t); handleGenerate(t) }}
                    style={{ fontFamily: T.mono, fontSize: 11, color: T.muted2, background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 4, padding: '4px 10px', cursor: 'pointer', transition: 'all 0.1s' }}
                    onMouseEnter={e => { e.target.style.borderColor = T.accentBd; e.target.style.color = T.accent }}
                    onMouseLeave={e => { e.target.style.borderColor = T.border; e.target.style.color = T.muted2 }}
                  >{t}</button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 20, marginTop: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: T.green, fontSize: 12 }}>✓</span>
                  <span style={{ fontFamily: T.mono, fontSize: 10, color: T.muted2 }}>Free preview above</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: T.green, fontSize: 12 }}>✓</span>
                  <span style={{ fontFamily: T.mono, fontSize: 10, color: T.muted2 }}>No signup for demo</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: T.green, fontSize: 12 }}>✓</span>
                  <span style={{ fontFamily: T.mono, fontSize: 10, color: T.muted2 }}>Real SEC data</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: report mockup */}
          <div style={{ animation: 'fadeUp 0.6s ease 0.2s both' }}>
            <ReportMockup />
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────
function StatsBar() {
  return (
    <div style={{ background: T.bg2, borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}`, padding: '28px 24px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0 }}>
        {[
          { n: '8,400+', label: 'US stocks covered', sub: 'NYSE · NASDAQ · OTC' },
          { n: '< 60s', label: 'Report generation', sub: 'Average completion time' },
          { n: '10-K / 10-Q', label: 'Live SEC filings', sub: 'XBRL structured data' },
          { n: 'A+ → F', label: 'Piotroski scoring', sub: '9-point quality screen' },
        ].map((s, i) => (
          <div key={i} style={{ padding: '0 32px', borderRight: i < 3 ? `1px solid ${T.border}` : 'none', textAlign: 'center' }}>
            <div style={{ fontFamily: T.mono, fontSize: 28, fontWeight: 700, color: T.accent, marginBottom: 4 }}>{s.n}</div>
            <div style={{ fontFamily: T.sans, fontSize: 13, color: T.text, fontWeight: 500, marginBottom: 3 }}>{s.label}</div>
            <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted }}>{s.sub}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Features ─────────────────────────────────────────────────────────────────
const FEATURES = [
  { icon: '⬡', title: 'DCF + Monte Carlo', desc: '8-year two-stage discounted cash flow model with 2,000 Monte Carlo trials. See the full P10–P90 value distribution, not just a single price target.', tag: 'Valuation' },
  { icon: '◎', title: 'Live SEC EDGAR Data', desc: 'Revenue, margins, FCF, balance sheet — sourced directly from official 10-K and 10-Q XBRL filings. No stale PDFs, no third-party data vendors.', tag: 'Data' },
  { icon: '◈', title: 'Comparable Company Analysis', desc: 'AI-generated comps table with EV/EBITDA, P/E, revenue growth, and gross margin for peer benchmarking against sector leaders.', tag: 'Analysis' },
  { icon: '◇', title: 'Altman Z-Score', desc: 'Five-factor bankruptcy prediction model with real-time data. Immediately flags financial distress risk before you read a single line of the filing.', tag: 'Risk' },
  { icon: '◻', title: 'Piotroski F-Score', desc: '9-point fundamental quality screen across profitability, leverage, and operating efficiency. Separates compounders from value traps.', tag: 'Quality' },
  { icon: '◬', title: 'BUY / HOLD / SELL', desc: 'Clear investment recommendation with a 12-month price target, upside percentage, and bull and bear case arguments — all grounded in the numbers.', tag: 'Output' },
]

function Features() {
  return (
    <section id="features" style={{ padding: '100px 24px', background: T.bg }}>
      <div style={{ maxWidth: 1060, margin: '0 auto' }}>
        <SectionLabel>What AXIOM produces</SectionLabel>
        <h2 style={{ fontFamily: T.sans, fontSize: 40, fontWeight: 800, color: T.text, letterSpacing: -1.5, textAlign: 'center', margin: '0 0 12px', lineHeight: 1.1 }}>
          Six analyses. One report.
        </h2>
        <p style={{ textAlign: 'center', fontSize: 15, color: T.muted2, margin: '0 auto 56px', maxWidth: 480, lineHeight: 1.7 }}>
          Everything an institutional analyst produces over hours — in one structured, data-driven output.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, background: T.border }}>
          {FEATURES.map((f, i) => (
            <div key={i} style={{ background: T.bg2, padding: '28px 28px', transition: 'background 0.15s', cursor: 'default' }}
              onMouseEnter={e => e.currentTarget.style.background = T.panel}
              onMouseLeave={e => e.currentTarget.style.background = T.bg2}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div style={{ fontFamily: T.mono, fontSize: 24, color: T.accent }}>{f.icon}</div>
                <Badge>{f.tag}</Badge>
              </div>
              <div style={{ fontFamily: T.sans, fontSize: 15, fontWeight: 600, color: T.text, marginBottom: 10 }}>{f.title}</div>
              <div style={{ fontSize: 13, color: T.muted2, lineHeight: 1.7 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Report Anatomy ───────────────────────────────────────────────────────────
function ReportAnatomy() {
  const sections = [
    { label: 'Executive Summary', desc: '3-4 sentence overview of growth, margins, and valuation stance' },
    { label: 'Investment Thesis', desc: 'Clear take: why to buy, hold, or sell this specific stock now' },
    { label: 'Financial Highlights', desc: 'Revenue growth, margin expansion, balance sheet, FCF quality' },
    { label: 'Bull / Bear Case', desc: '3 specific bull arguments and 3 specific bear arguments with numbers' },
    { label: 'DCF Valuation', desc: 'Full 8-year model with Monte Carlo sensitivity and P10–P90 range' },
    { label: 'Comparable Companies', desc: 'Peer table: EV/EBITDA, P/E, growth, margins across 3 comps' },
    { label: 'Risk Matrix', desc: '4+ risks rated HIGH / MEDIUM / LOW across 5 categories' },
    { label: 'Analyst Note', desc: 'Definitive closing stance with specific numbers — no boilerplate' },
  ]
  return (
    <section style={{ padding: '80px 24px', background: T.bg2, borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}` }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <SectionLabel>Report structure</SectionLabel>
        <h2 style={{ fontFamily: T.sans, fontSize: 36, fontWeight: 800, color: T.text, letterSpacing: -1.2, textAlign: 'center', margin: '0 0 48px', lineHeight: 1.1 }}>
          Eight sections. Every report.
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, background: T.border }}>
          {sections.map((s, i) => (
            <div key={i} style={{ background: T.panel, padding: '20px 24px', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ fontFamily: T.mono, fontSize: 11, color: T.accent, minWidth: 24, paddingTop: 1 }}>0{i + 1}</div>
              <div>
                <div style={{ fontFamily: T.sans, fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 5 }}>{s.label}</div>
                <div style={{ fontSize: 12, color: T.muted2, lineHeight: 1.6 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Data Section ─────────────────────────────────────────────────────────────
function DataSection() {
  return (
    <section style={{ padding: '100px 24px', background: T.bg }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center' }}>
        <div>
          <SectionLabel>Data source</SectionLabel>
          <h2 style={{ fontFamily: T.sans, fontSize: 36, fontWeight: 800, color: T.text, letterSpacing: -1.2, margin: '0 0 16px', lineHeight: 1.1 }}>
            Live SEC EDGAR.<br />No data vendors.
          </h2>
          <p style={{ fontSize: 14, color: T.muted2, lineHeight: 1.75, margin: '0 0 28px' }}>
            Every report pulls directly from the SEC's EDGAR XBRL database — the same structured financial data that institutional investors and Bloomberg terminals use. No third-party aggregators, no stale quarterly exports.
          </p>
          {[
            'Real-time 10-K and 10-Q filings',
            'XBRL structured financial data',
            'Income statement, balance sheet, cash flows',
            'Historical revenue, margins, FCF trends',
            'Live market price and market cap',
          ].map(f => (
            <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: T.accent, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: T.muted2 }}>{f}</span>
            </div>
          ))}
        </div>
        {/* Fake terminal */}
        <div style={{ background: T.panel, border: `1px solid ${T.border2}`, borderRadius: 10, overflow: 'hidden', fontFamily: T.mono, fontSize: 11 }}>
          <div style={{ background: T.bg3, padding: '10px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: T.red + '80' }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: T.gold + '80' }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: T.green + '80' }} />
            <span style={{ marginLeft: 8, color: T.muted, fontSize: 10 }}>SEC EDGAR · XBRL</span>
          </div>
          <div style={{ padding: '16px 20px', lineHeight: 1.9 }}>
            {[
              ['GET', '/api/edgar?ticker=NVDA', T.accent],
              ['→', 'Resolving CIK: 0001045810', T.muted2],
              ['→', 'Fetching companyfacts...', T.muted2],
              ['✓', 'Revenue (us-gaap:Revenues)', T.green],
              ['✓', 'NetIncomeLoss · OperatingIncomeLoss', T.green],
              ['✓', 'Assets · Liabilities · Equity', T.green],
              ['✓', 'CashFlowFromOperations · CapEx', T.green],
              ['→', 'Fetching live price: $875.20', T.muted2],
              ['✓', '28 financial fields extracted', T.green],
            ].map(([prefix, line, color], i) => (
              <div key={i} style={{ display: 'flex', gap: 12 }}>
                <span style={{ color: prefix === 'GET' ? T.gold : prefix === '✓' ? T.green : T.muted, minWidth: 24 }}>{prefix}</span>
                <span style={{ color }}>{line}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Pricing ──────────────────────────────────────────────────────────────────
function Pricing({ navigate }) {
  const { isSignedIn } = useUser()
  return (
    <section id="pricing" style={{ padding: '100px 24px', background: T.bg2, borderTop: `1px solid ${T.border}` }}>
      <div style={{ maxWidth: 840, margin: '0 auto' }}>
        <SectionLabel>Pricing</SectionLabel>
        <h2 style={{ fontFamily: T.sans, fontSize: 40, fontWeight: 800, color: T.text, letterSpacing: -1.5, textAlign: 'center', margin: '0 0 12px' }}>
          Start free. No card.
        </h2>
        <p style={{ textAlign: 'center', fontSize: 15, color: T.muted2, margin: '0 auto 52px' }}>
          Full institutional-grade reports, no API keys required.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Free */}
          <div style={{ background: T.panel, border: `1px solid ${T.border2}`, borderRadius: 12, padding: '36px 32px' }}>
            <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted2, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12 }}>Free</div>
            <div style={{ fontFamily: T.mono, fontSize: 48, fontWeight: 700, color: T.text, marginBottom: 6, lineHeight: 1 }}>$0</div>
            <div style={{ fontSize: 13, color: T.muted2, marginBottom: 32, lineHeight: 1.6 }}>2 full reports per month. No credit card, no API keys, no setup.</div>
            {['2 reports / month', 'Full DCF + Monte Carlo', 'Altman Z-Score + Piotroski F', 'Comps table + risk matrix', 'BUY / HOLD / SELL recommendation', 'PDF export'].map(f => (
              <div key={f} style={{ display: 'flex', gap: 10, marginBottom: 10, fontSize: 13, color: T.muted2 }}>
                <span style={{ color: T.green }}>✓</span> {f}
              </div>
            ))}
            <SignUpButton mode="modal">
              <button style={{ display: 'block', width: '100%', marginTop: 32, background: T.accent, color: '#000', border: 'none', borderRadius: 8, padding: '14px 0', fontFamily: T.mono, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Get started free →
              </button>
            </SignUpButton>
          </div>

          {/* Pro */}
          <div style={{ background: T.panel, border: `1px solid ${T.accentBd}`, borderRadius: 12, padding: '36px 32px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, right: 0, background: T.accent, color: '#000', fontFamily: T.mono, fontSize: 9, fontWeight: 700, padding: '5px 14px', borderRadius: '0 12px 0 6px', letterSpacing: 1 }}>
              COMING SOON
            </div>
            <div style={{ fontFamily: T.mono, fontSize: 10, color: T.accent, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12 }}>Pro</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
              <span style={{ fontFamily: T.mono, fontSize: 48, fontWeight: 700, color: T.text, lineHeight: 1 }}>$49</span>
              <span style={{ fontFamily: T.mono, fontSize: 13, color: T.muted2 }}>/month</span>
            </div>
            <div style={{ fontSize: 13, color: T.muted2, marginBottom: 32, lineHeight: 1.6 }}>No API keys. No limits. Priority AI models.</div>
            {['Unlimited reports', 'Cloud report history', 'Shareable report links', 'Priority AI (Claude Opus)', 'Team accounts (3 seats)', 'Advanced PDF exports'].map(f => (
              <div key={f} style={{ display: 'flex', gap: 10, marginBottom: 10, fontSize: 13, color: T.muted2 }}>
                <span style={{ color: T.accent }}>✓</span> {f}
              </div>
            ))}
            <button disabled style={{ display: 'block', width: '100%', marginTop: 32, background: T.accentLo, color: T.muted, border: `1px solid ${T.border}`, borderRadius: 8, padding: '14px 0', fontFamily: T.mono, fontSize: 13, fontWeight: 700, cursor: 'not-allowed' }}>
              Notify me when available
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Use Cases ────────────────────────────────────────────────────────────────
function UseCases() {
  const cases = [
    { role: 'Retail Investors', icon: '◎', desc: 'Stop reading Reddit for stock picks. Get the same analysis a buy-side analyst runs — in 60 seconds, on any stock you\'re considering.' },
    { role: 'Finance Students', icon: '⬡', desc: 'Learn what a real equity research note looks like. Use AXIOM reports as reference material for DCF modeling, comp analysis, and investment memo writing.' },
    { role: 'Analysts & Associates', icon: '◈', desc: 'Run a fast first-pass analysis on any company before spending hours in a model. Validate your assumptions against a second opinion.' },
    { role: 'Finance Creators', icon: '◇', desc: 'Power your newsletter, YouTube channel, or podcast with data-backed analysis. Generate a credible research note before you record.' },
  ]
  return (
    <section style={{ padding: '100px 24px', background: T.bg, borderTop: `1px solid ${T.border}` }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <SectionLabel>Who uses AXIOM</SectionLabel>
        <h2 style={{ fontFamily: T.sans, fontSize: 36, fontWeight: 800, color: T.text, letterSpacing: -1.2, textAlign: 'center', margin: '0 0 52px', lineHeight: 1.1 }}>
          Built for anyone who takes stocks seriously.
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2, background: T.border }}>
          {cases.map((c, i) => (
            <div key={i} style={{ background: T.bg2, padding: '32px 28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div style={{ fontFamily: T.mono, fontSize: 22, color: T.accent }}>{c.icon}</div>
                <div style={{ fontFamily: T.sans, fontSize: 15, fontWeight: 700, color: T.text }}>{c.role}</div>
              </div>
              <div style={{ fontSize: 13, color: T.muted2, lineHeight: 1.75 }}>{c.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Trust ────────────────────────────────────────────────────────────────────
function Trust() {
  return (
    <section style={{ padding: '80px 24px', background: T.bg2, borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}` }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <SectionLabel>Security & privacy</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[
            { icon: '◎', title: 'No data stored', desc: 'Reports are generated on-demand and not retained server-side. Your queries are private.' },
            { icon: '⬡', title: 'Auth via Clerk', desc: 'Industry-standard authentication with OAuth2. Supports Google, GitHub, X, and email.' },
            { icon: '◇', title: 'SEC EDGAR only', desc: 'All financial data is sourced exclusively from public SEC filings. No scraped or unverified data.' },
          ].map((t, i) => (
            <div key={i} style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 10, padding: '24px 22px' }}>
              <div style={{ fontFamily: T.mono, fontSize: 20, color: T.accent, marginBottom: 12 }}>{t.icon}</div>
              <div style={{ fontFamily: T.sans, fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 8 }}>{t.title}</div>
              <div style={{ fontSize: 12, color: T.muted2, lineHeight: 1.7 }}>{t.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────
const FAQS = [
  { q: 'How accurate are the reports?', a: 'AXIOM sources all financial data directly from SEC EDGAR\'s structured XBRL database — the same data Bloomberg and FactSet use. The AI analysis is based entirely on that data. As with any model, outputs should be used as a starting point, not a final investment decision.' },
  { q: 'Which stocks does AXIOM cover?', a: 'Any US-listed company that files with the SEC — NYSE, NASDAQ, and OTC markets. This includes all S&P 500 companies, mid-caps, and most small-caps with XBRL-formatted filings.' },
  { q: 'How is AXIOM different from a screener or data tool?', a: 'Screeners give you tables of numbers. AXIOM produces a full written research note — with a DCF model, comparable company analysis, risk matrix, and an investment recommendation — the same output a junior analyst spends hours on.' },
  { q: 'Do I need to provide my own AI API key?', a: 'No. AXIOM runs entirely on our infrastructure. Sign up and generate reports immediately — no keys, no configuration, no setup.' },
  { q: 'What does the free plan include?', a: '2 complete, full-length equity research reports per month. Every section is included: DCF, Monte Carlo, comps, risk matrix, analyst note. No features are paywalled on the free tier.' },
  { q: 'When is Pro launching?', a: 'Soon. Pro will offer unlimited reports, cloud report history, shareable links, and priority AI models. Sign up for free to get notified.' },
]

function FAQ() {
  const [open, setOpen] = useState(null)
  return (
    <section id="faq" style={{ padding: '100px 24px', background: T.bg, borderTop: `1px solid ${T.border}` }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <SectionLabel>FAQ</SectionLabel>
        <h2 style={{ fontFamily: T.sans, fontSize: 36, fontWeight: 800, color: T.text, letterSpacing: -1.2, textAlign: 'center', margin: '0 0 48px' }}>
          Common questions.
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {FAQS.map((f, i) => (
            <div key={i} style={{ background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 8, overflow: 'hidden', transition: 'border-color 0.15s' }}>
              <button onClick={() => setOpen(open === i ? null : i)} style={{ width: '100%', background: 'none', border: 'none', padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ fontFamily: T.sans, fontSize: 14, fontWeight: 600, color: T.text }}>{f.q}</span>
                <span style={{ fontFamily: T.mono, fontSize: 16, color: T.muted, marginLeft: 16, flexShrink: 0, transform: open === i ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s' }}>+</span>
              </button>
              {open === i && (
                <div style={{ padding: '0 20px 18px', fontSize: 13, color: T.muted2, lineHeight: 1.75, animation: 'fadeIn 0.15s ease' }}>{f.a}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Final CTA ────────────────────────────────────────────────────────────────
function FinalCTA({ navigate }) {
  const { isSignedIn } = useUser()
  return (
    <section style={{ padding: '100px 24px', background: T.bg2, borderTop: `1px solid ${T.border}`, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 700, height: 300, background: `radial-gradient(ellipse, ${T.accent}0e 0%, transparent 70%)`, zIndex: 0 }} />
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 600, margin: '0 auto' }}>
        <h2 style={{ fontFamily: T.sans, fontSize: 48, fontWeight: 800, color: T.text, letterSpacing: -2, margin: '0 0 16px', lineHeight: 1.05 }}>
          Start your first<br /><span style={{ color: T.accent }}>free report now.</span>
        </h2>
        <p style={{ fontSize: 15, color: T.muted2, margin: '0 auto 36px', lineHeight: 1.7, maxWidth: 420 }}>
          Institutional equity research on any US stock in under 60 seconds. No card. No setup.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          {isSignedIn ? (
            <button onClick={() => navigate('/app')} style={{ background: T.accent, color: '#000', fontFamily: T.mono, fontSize: 14, fontWeight: 700, padding: '15px 36px', borderRadius: 8, border: 'none', cursor: 'pointer', letterSpacing: 0.3 }}>
              Open AXIOM →
            </button>
          ) : (
            <>
              <SignUpButton mode="modal">
                <button style={{ background: T.accent, color: '#000', fontFamily: T.mono, fontSize: 14, fontWeight: 700, padding: '15px 36px', borderRadius: 8, border: 'none', cursor: 'pointer', letterSpacing: 0.3 }}>
                  Generate a free report →
                </button>
              </SignUpButton>
              <SignInButton mode="modal">
                <button style={{ background: 'transparent', color: T.muted2, fontFamily: T.mono, fontSize: 13, padding: '15px 24px', borderRadius: 8, border: `1px solid ${T.border2}`, cursor: 'pointer' }}>
                  Sign in
                </button>
              </SignInButton>
            </>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 24 }}>
          {['Free forever', '2 reports/month', 'No credit card'].map(t => (
            <span key={t} style={{ fontFamily: T.mono, fontSize: 10, color: T.muted }}>✓ {t}</span>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer style={{ background: T.bg, borderTop: `1px solid ${T.border}`, padding: '32px 40px' }}>
      <div style={{ maxWidth: 1060, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 700, color: T.accent, letterSpacing: 3, marginBottom: 6 }}>AXIOM</div>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted }}>Institutional Equity Research · Powered by SEC EDGAR</div>
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted, textAlign: 'right', lineHeight: 1.8 }}>
          <div>Data: SEC EDGAR XBRL · Auth: Clerk · Infra: Vercel + Neon</div>
          <div>No financial data stored server-side · Not investment advice</div>
        </div>
      </div>
    </footer>
  )
}

// ─── Main Landing ─────────────────────────────────────────────────────────────
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

  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = `
      @keyframes spin { to { transform: rotate(360deg) } }
      @keyframes ticker { from { transform: translateX(0) } to { transform: translateX(-50%) } }
      @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
      @keyframes fadeUp { from { opacity: 0; transform: translateY(20px) } to { opacity: 1; transform: translateY(0) } }
      @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }
      @media print { .no-print { display: none !important } body { background: #fff !important } }
    `
    document.head.appendChild(style)
    return () => document.head.removeChild(style)
  }, [])

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
        if (aiData.limitReached) throw new Error('Demo limit reached (1/day). Sign up free for 2 full reports/month.')
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

  // Show full report
  if (report) {
    return (
      <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: T.sans }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeIn{from{opacity:0}to{opacity:1}}@media print{.no-print{display:none!important}body{background:#fff!important}@page{margin:14mm}}`}</style>
        <div className="no-print" style={{ background: T.accentLo, borderBottom: `1px solid ${T.accentBd}`, padding: '10px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontFamily: T.mono, fontSize: 11, color: T.accent }}>
            Demo · Groq llama-3.3-70b · 1 free preview / day
            <span style={{ color: T.muted2, marginLeft: 12 }}>Sign up for 2 full reports/month →</span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => { setReport(null); setTicker('') }} style={{ fontFamily: T.mono, fontSize: 11, color: T.muted2, background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 4, padding: '5px 12px', cursor: 'pointer' }}>← Back</button>
            <button onClick={() => navigate('/app')} style={{ fontFamily: T.mono, fontSize: 11, color: '#000', background: T.accent, border: 'none', borderRadius: 4, padding: '5px 14px', cursor: 'pointer', fontWeight: 700 }}>Sign up free →</button>
          </div>
        </div>
        <div style={{ animation: 'fadeIn 0.3s ease' }}>
          <ResearchReport ticker={currentTicker} financials={financials || {}} result={report} />
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: T.sans }}>
      <Nav navigate={navigate} />
      <Hero navigate={navigate} runDemo={runDemo} ticker={ticker} setTicker={setTicker} loading={loading} progress={progress} progressPct={progressPct} error={error} />
      <TickerStrip />
      <StatsBar />
      <Features />
      <ReportAnatomy />
      <DataSection />
      <Pricing navigate={navigate} />
      <UseCases />
      <Trust />
      <FAQ />
      <FinalCTA navigate={navigate} />
      <Footer />
    </div>
  )
}
