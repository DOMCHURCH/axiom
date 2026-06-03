import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import ResearchReport from '../components/ResearchReport.jsx'
import { SignInButton, SignUpButton, UserButton, useUser } from '@clerk/clerk-react'

// ─── Design Tokens ───────────────────────────────────────────────────────────
const T = {
  bg:       '#050810',
  bg2:      '#07091a',
  bg3:      '#0a0d24',
  panel:    '#0d1228',
  panelHov: '#101530',
  border:   '#1a2744',
  border2:  '#243358',
  accent:   '#0ea5e9',
  accentLo: '#0ea5e910',
  accentBd: '#0ea5e935',
  accentMid:'#0ea5e960',
  green:    '#10b981',
  greenLo:  '#10b98115',
  red:      '#ef4444',
  gold:     '#f59e0b',
  text:     '#f0f6ff',
  text2:    '#94a3b8',
  text3:    '#64748b',
  muted:    '#3d5470',
  muted2:   '#6b849e',
  mono:     "'IBM Plex Mono', 'Courier New', monospace",
  sans:     "'Inter', system-ui, sans-serif",
}

const clerkEnabled = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

// ─── useInView hook ───────────────────────────────────────────────────────────
function useInView(options = {}) {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setInView(true); obs.disconnect() }
    }, { threshold: 0.1, ...options })
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])
  return [ref, inView]
}

// ─── Section wrapper with scroll animation ────────────────────────────────────
function Section({ children, style, ...props }) {
  const [ref, inView] = useInView()
  return (
    <section ref={ref} style={{ opacity: inView ? 1 : 0, transform: inView ? 'translateY(0)' : 'translateY(24px)', transition: 'opacity 0.6s ease, transform 0.6s ease', ...style }} {...props}>
      {children}
    </section>
  )
}

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
      <div style={{ width: 32, height: 1, background: `linear-gradient(90deg, transparent, ${T.accentBd})` }} />
      <span style={{ fontFamily: T.mono, fontSize: 10, color: T.accent, letterSpacing: 2, textTransform: 'uppercase' }}>{children}</span>
      <div style={{ width: 32, height: 1, background: `linear-gradient(90deg, ${T.accentBd}, transparent)` }} />
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
        <div style={{ width: pct + '%', height: '100%', background: `linear-gradient(90deg, ${color}, ${color}cc)`, borderRadius: 2 }} />
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
    <div style={{
      overflow: 'hidden',
      borderTop: `1px solid ${T.border}`,
      borderBottom: `1px solid ${T.border}`,
      background: T.bg2,
      padding: '11px 0',
      WebkitMaskImage: 'linear-gradient(90deg, transparent, black 10%, black 90%, transparent)',
      maskImage: 'linear-gradient(90deg, transparent, black 10%, black 90%, transparent)',
    }}>
      <div style={{ display: 'flex', animation: 'ticker 40s linear infinite', width: 'max-content' }}>
        {items.map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 36px', borderRight: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>
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
    <div style={{
      animation: 'float 6s ease-in-out infinite',
      background: T.panel,
      border: `1px solid ${T.border2}`,
      borderRadius: 14,
      overflow: 'hidden',
      boxShadow: `0 40px 100px #00000090, 0 0 0 1px ${T.border}, 0 0 60px ${T.accent}08`,
      maxWidth: 580,
      margin: '0 auto',
    }}>
      {/* Report header */}
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: `linear-gradient(135deg, ${T.panel}, ${T.bg3})` }}>
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
  const [navReady, setNavReady] = useState(false)
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', fn)
    setTimeout(() => setNavReady(true), 50)
    return () => window.removeEventListener('scroll', fn)
  }, [])

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 40px', height: 60,
      background: scrolled ? `${T.bg}f8` : 'transparent',
      borderBottom: scrolled ? `1px solid ${T.border}` : '1px solid transparent',
      backdropFilter: scrolled ? 'blur(20px) saturate(180%)' : 'none',
      transition: 'all 0.25s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 44 }}>
        <div
          style={{ fontFamily: T.mono, fontSize: 16, fontWeight: 700, color: T.accent, letterSpacing: 5, cursor: 'pointer', transition: 'text-shadow 0.2s' }}
          onMouseEnter={e => e.currentTarget.style.textShadow = '0 0 20px #0ea5e950'}
          onMouseLeave={e => e.currentTarget.style.textShadow = 'none'}
        >AXIOM</div>
        <div className="nav-links" style={{ display: 'flex', gap: 32 }}>
          {['Features', 'Pricing', 'FAQ'].map((item, i) => (
            <a
              key={item}
              href={`#${item.toLowerCase()}`}
              style={{
                fontFamily: T.sans, fontSize: 13, color: T.muted2, textDecoration: 'none',
                transition: 'color 0.15s',
                opacity: navReady ? 1 : 0,
                animation: navReady ? `fadeIn 0.4s ease ${i * 0.08}s both` : 'none',
              }}
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
              <button
                style={{ fontFamily: T.mono, fontSize: 12, color: T.muted2, background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px 4px', transition: 'color 0.15s' }}
                onMouseEnter={e => e.target.style.color = T.text}
                onMouseLeave={e => e.target.style.color = T.muted2}
              >Sign in</button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button
                style={{ fontFamily: T.mono, fontSize: 12, color: '#000', background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)', border: 'none', borderRadius: 7, padding: '9px 20px', cursor: 'pointer', fontWeight: 700, letterSpacing: 0.3, boxShadow: '0 4px 20px #0ea5e940', transition: 'all 0.15s cubic-bezier(0.4,0,0.2,1)' }}
                onMouseEnter={e => { e.target.style.transform = 'scale(1.03)'; e.target.style.boxShadow = '0 6px 28px #0ea5e960' }}
                onMouseLeave={e => { e.target.style.transform = 'scale(1)'; e.target.style.boxShadow = '0 4px 20px #0ea5e940' }}
              >
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
  const [inputFocused, setInputFocused] = useState(false)
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
      {/* Fine dot grid background */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(${T.border} 1px, transparent 1px)`, backgroundSize: '28px 28px', zIndex: 0, opacity: 0.6 }} />
      {/* Radial glow */}
      <div style={{ position: 'absolute', top: '-10%', left: '50%', transform: 'translateX(-50%)', width: 900, height: 600, background: `radial-gradient(ellipse, ${T.accent}14 0%, transparent 65%)`, zIndex: 0 }} />
      {/* Bottom fade */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 200, background: `linear-gradient(to bottom, transparent, ${T.bg})`, zIndex: 1 }} />

      <div style={{ position: 'relative', zIndex: 2, maxWidth: 1100, margin: '0 auto', width: '100%' }}>
        <div className="hero-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 72, alignItems: 'center' }}>
          {/* Left: copy */}
          <div style={{ animation: 'fadeUp 0.6s ease 0.05s both' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: T.accentLo, border: `1px solid ${T.accentBd}`, borderRadius: 99, padding: '6px 16px', marginBottom: 32 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.green, boxShadow: `0 0 8px ${T.green}` }} />
              <span style={{ fontFamily: T.mono, fontSize: 11, color: T.accent, letterSpacing: 1.5, textTransform: 'uppercase' }}>Live · SEC EDGAR Data</span>
            </div>

            <h1 className="hero-h1" style={{ fontSize: 'clamp(40px, 5vw, 58px)', fontWeight: 800, color: T.text, letterSpacing: -2.5, lineHeight: 1.04, margin: '0 0 22px', fontFamily: T.sans }}>
              Institutional equity<br />research.{' '}
              <span style={{ background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Generated in 60s.</span>
            </h1>

            <p style={{ fontSize: 16, color: T.text2, lineHeight: 1.8, margin: '0 0 38px', maxWidth: 460, fontFamily: T.sans }}>
              AXIOM turns live SEC EDGAR filings into complete investment reports — DCF modeling, Monte Carlo simulation, comps, risk scoring, and a BUY / HOLD / SELL recommendation.
            </p>

            {/* Input */}
            <div style={{ maxWidth: 460 }}>
              <form onSubmit={e => { e.preventDefault(); handleGenerate(ticker) }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  <div style={{
                    flex: 1, display: 'flex', alignItems: 'center', gap: 0,
                    background: T.panel,
                    border: `1px solid ${inputFocused ? T.accentMid : loading ? T.accent + '66' : T.border2}`,
                    borderRadius: 10, overflow: 'hidden',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                    boxShadow: inputFocused ? `0 0 0 1px ${T.accent}30, 0 8px 32px ${T.accent}10` : loading ? `0 0 0 3px ${T.accent}12` : 'none',
                  }}>
                    <span style={{ fontFamily: T.mono, fontSize: 14, color: T.muted, padding: '0 14px' }}>$</span>
                    <input
                      ref={inputRef}
                      type="text"
                      placeholder="AAPL, NVDA, MSFT..."
                      value={ticker}
                      onChange={e => setTicker(e.target.value.toUpperCase().replace(/[^A-Z.]/g, ''))}
                      disabled={loading}
                      onFocus={() => setInputFocused(true)}
                      onBlur={() => setInputFocused(false)}
                      style={{ flex: 1, background: 'transparent', border: 'none', padding: '16px 14px 16px 0', color: T.text, fontFamily: T.mono, fontSize: 15, outline: 'none' }}
                    />
                  </div>
                  <button type="submit" disabled={loading || !ticker.trim()} style={{
                    background: loading || !ticker.trim() ? T.bg3 : 'linear-gradient(135deg, #0ea5e9, #38bdf8)',
                    color: loading || !ticker.trim() ? T.muted : '#000',
                    border: 'none', borderRadius: 10, padding: '0 24px',
                    fontFamily: T.mono, fontSize: 13, fontWeight: 700,
                    cursor: loading || !ticker.trim() ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 8,
                    boxShadow: loading || !ticker.trim() ? 'none' : '0 4px 20px #0ea5e930',
                    transition: 'all 0.15s cubic-bezier(0.4,0,0.2,1)',
                    letterSpacing: 0.3,
                  }}
                    onMouseEnter={e => { if (!loading && ticker.trim()) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 28px #0ea5e950' } }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = loading || !ticker.trim() ? 'none' : '0 4px 20px #0ea5e930' }}
                  >
                    {loading ? <><Spinner /> Running...</> : isSignedIn ? 'Analyze →' : 'Preview →'}
                  </button>
                </div>
              </form>

              {loading && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ height: 2, background: T.border, borderRadius: 1, overflow: 'hidden', marginBottom: 8 }}>
                    <div style={{ height: '100%', background: `linear-gradient(90deg, ${T.accent}, #38bdf8, ${T.accent})`, backgroundSize: '200% 100%', width: progressPct + '%', transition: 'width 0.5s ease', borderRadius: 1, animation: progressPct < 100 ? 'shimmer 1.5s linear infinite' : 'none' }} />
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: 11, color: T.accent, animation: 'pulse 1.5s infinite' }}>{progress}</div>
                </div>
              )}

              {error && !error.includes('limit') && (
                <div style={{ background: T.red + '12', border: `1px solid ${T.red}30`, borderRadius: 8, padding: '12px 16px', fontFamily: T.mono, fontSize: 11, color: T.red, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>⚠</span><span>{error}</span>
                </div>
              )}

              {/* Quick picks */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 22 }}>
                <span style={{ fontFamily: T.mono, fontSize: 10, color: T.muted, marginRight: 2 }}>Try:</span>
                {POPULAR.map(t => (
                  <button key={t} onClick={() => { setTicker(t); handleGenerate(t) }}
                    style={{ fontFamily: T.mono, fontSize: 11, color: T.muted2, background: `${T.accentLo}`, border: `1px solid ${T.border}`, borderRadius: 99, padding: '4px 12px', cursor: 'pointer', transition: 'all 0.15s', backdropFilter: 'blur(6px)' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = T.accentBd; e.currentTarget.style.color = T.accent; e.currentTarget.style.background = `${T.accent}18` }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.muted2; e.currentTarget.style.background = T.accentLo }}
                  >{t}</button>
                ))}
              </div>

              {/* Trust badges */}
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                {['Free preview above', 'No signup for demo', 'Real SEC data'].map(t => (
                  <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: T.green, boxShadow: `0 0 6px ${T.green}` }} />
                    <span style={{ fontFamily: T.mono, fontSize: 10, color: T.muted2 }}>{t}</span>
                  </div>
                ))}
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
    <div style={{ background: T.bg2, borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}`, padding: '36px 24px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0 }}>
          {[
            { n: '8,400+', label: 'US stocks covered', sub: 'NYSE · NASDAQ · OTC' },
            { n: '< 60s', label: 'Report generation', sub: 'Average completion time' },
            { n: '10-K / 10-Q', label: 'Live SEC filings', sub: 'XBRL structured data' },
            { n: 'A+ → F', label: 'Piotroski scoring', sub: '9-point quality screen' },
          ].map((s, i) => (
            <div key={i} style={{ padding: '0 32px', borderRight: i < 3 ? `1px solid ${T.border}` : 'none', textAlign: 'center', position: 'relative' }}>
              {i < 3 && <div style={{ position: 'absolute', right: 0, top: '20%', bottom: '20%', width: 1, background: `linear-gradient(to bottom, transparent, ${T.border}, transparent)` }} />}
              <div style={{ fontFamily: T.mono, fontSize: 28, fontWeight: 700, color: T.accent, marginBottom: 6, letterSpacing: -0.5 }}>{s.n}</div>
              <div style={{ fontFamily: T.sans, fontSize: 13, color: T.text, fontWeight: 500, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted }}>{s.sub}</div>
            </div>
          ))}
        </div>
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
    <Section id="features" style={{ padding: '120px 24px', background: T.bg }}>
      <div style={{ maxWidth: 1060, margin: '0 auto' }}>
        <SectionLabel>What AXIOM produces</SectionLabel>
        <h2 style={{ fontFamily: T.sans, fontSize: 42, fontWeight: 800, color: T.text, letterSpacing: -1.8, textAlign: 'center', margin: '0 0 14px', lineHeight: 1.08 }}>
          Six analyses. One report.
        </h2>
        <p style={{ textAlign: 'center', fontSize: 15, color: T.text2, margin: '0 auto 64px', maxWidth: 500, lineHeight: 1.75, fontFamily: T.sans }}>
          Everything an institutional analyst produces over hours — in one structured, data-driven output.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }} className="features-grid">
          {FEATURES.map((f, i) => (
            <div key={i}
              style={{ background: T.panel, border: '1px solid #1a2744', borderRadius: 14, padding: '32px 28px', transition: 'all 0.2s ease', cursor: 'default', position: 'relative', overflow: 'hidden' }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'linear-gradient(#0d1228, #0d1228) padding-box, linear-gradient(135deg, #0ea5e940, #38bdf820) border-box'
                e.currentTarget.style.border = '1px solid transparent'
                e.currentTarget.style.boxShadow = '0 8px 32px #00000040'
                e.currentTarget.style.transform = 'translateY(-2px)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = T.panel
                e.currentTarget.style.border = '1px solid #1a2744'
                e.currentTarget.style.boxShadow = 'none'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              <div style={{ position: 'absolute', top: 20, left: 20, fontFamily: T.mono, fontSize: 10, color: T.muted, letterSpacing: 1 }}>
                {String(i + 1).padStart(2, '0')}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
                <Badge>{f.tag}</Badge>
              </div>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: `${T.accent}18`, border: `1px solid ${T.accentBd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, boxShadow: `0 0 16px ${T.accent}10` }}>
                <span style={{ fontFamily: T.mono, fontSize: 20, color: T.accent }}>{f.icon}</span>
              </div>
              <div style={{ fontFamily: T.sans, fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 10 }}>{f.title}</div>
              <div style={{ fontSize: 13, color: T.text2, lineHeight: 1.75 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </Section>
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
    <Section style={{ padding: '100px 24px', background: T.bg2, borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}` }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <SectionLabel>Report structure</SectionLabel>
        <h2 style={{ fontFamily: T.sans, fontSize: 38, fontWeight: 800, color: T.text, letterSpacing: -1.5, textAlign: 'center', margin: '0 0 52px', lineHeight: 1.08 }}>
          Eight sections. Every report.
        </h2>
        <div className="features-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, background: T.border }}>
          {sections.map((s, i) => (
            <div key={i} style={{ background: T.panel, padding: '22px 26px', display: 'flex', gap: 16, alignItems: 'flex-start', transition: 'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = T.panelHov}
              onMouseLeave={e => e.currentTarget.style.background = T.panel}
            >
              <div style={{ fontFamily: T.mono, fontSize: 11, color: T.accent, minWidth: 28, paddingTop: 1, letterSpacing: 1 }}>0{i + 1}</div>
              <div>
                <div style={{ fontFamily: T.sans, fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 6 }}>{s.label}</div>
                <div style={{ fontSize: 12, color: T.text2, lineHeight: 1.65 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}

// ─── Data Section ─────────────────────────────────────────────────────────────
function DataSection() {
  return (
    <Section style={{ padding: '120px 24px', background: T.bg }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 72, alignItems: 'center' }}>
        <div>
          <SectionLabel>Data source</SectionLabel>
          <h2 style={{ fontFamily: T.sans, fontSize: 38, fontWeight: 800, color: T.text, letterSpacing: -1.5, margin: '0 0 18px', lineHeight: 1.08 }}>
            Live SEC EDGAR.<br />No data vendors.
          </h2>
          <p style={{ fontSize: 14, color: T.text2, lineHeight: 1.8, margin: '0 0 30px', fontFamily: T.sans }}>
            Every report pulls directly from the SEC's EDGAR XBRL database — the same structured financial data that institutional investors and Bloomberg terminals use. No third-party aggregators, no stale quarterly exports.
          </p>
          {[
            'Real-time 10-K and 10-Q filings',
            'XBRL structured financial data',
            'Income statement, balance sheet, cash flows',
            'Historical revenue, margins, FCF trends',
            'Live market price and market cap',
          ].map(f => (
            <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: T.accent, flexShrink: 0, boxShadow: `0 0 6px ${T.accent}80` }} />
              <span style={{ fontSize: 13, color: T.text2, fontFamily: T.sans }}>{f}</span>
            </div>
          ))}
        </div>
        {/* Fake terminal */}
        <div style={{ background: T.panel, border: `1px solid ${T.border2}`, borderRadius: 12, overflow: 'hidden', fontFamily: T.mono, fontSize: 11, boxShadow: '0 24px 60px #00000050' }}>
          <div style={{ background: T.bg3, padding: '12px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: T.red + '80' }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: T.gold + '80' }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: T.green + '80' }} />
            <span style={{ marginLeft: 10, color: T.muted, fontSize: 10 }}>SEC EDGAR · XBRL</span>
          </div>
          <div style={{ padding: '20px 22px', lineHeight: 2 }}>
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
              <div key={i} style={{ display: 'flex', gap: 14 }}>
                <span style={{ color: prefix === 'GET' ? T.gold : prefix === '✓' ? T.green : T.muted, minWidth: 24 }}>{prefix}</span>
                <span style={{ color }}>{line}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  )
}

// ─── Pricing ──────────────────────────────────────────────────────────────────
function Pricing({ navigate }) {
  const { isSignedIn } = useUser()
  const [waitEmail, setWaitEmail] = useState('')
  const [waitStatus, setWaitStatus] = useState('') // '' | 'loading' | 'done' | 'error'

  async function joinWaitlist(e) {
    e.preventDefault()
    if (!waitEmail.includes('@')) return
    setWaitStatus('loading')
    try {
      const r = await fetch('/api/waitlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: waitEmail }) })
      setWaitStatus(r.ok ? 'done' : 'error')
    } catch { setWaitStatus('error') }
  }
  return (
    <Section id="pricing" style={{ padding: '120px 24px', background: T.bg2, borderTop: `1px solid ${T.border}` }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <SectionLabel>Pricing</SectionLabel>
        <h2 style={{ fontFamily: T.sans, fontSize: 42, fontWeight: 800, color: T.text, letterSpacing: -1.8, textAlign: 'center', margin: '0 0 14px' }}>
          Start free. No card.
        </h2>
        <p style={{ textAlign: 'center', fontSize: 15, color: T.text2, margin: '0 auto 56px', fontFamily: T.sans }}>
          Full institutional-grade reports, no API keys required.
        </p>

        <div className="pricing-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Free */}
          <div style={{ background: 'rgba(13,18,40,0.8)', backdropFilter: 'blur(12px)', border: `1px solid rgba(255,255,255,0.06)`, borderRadius: 18, padding: '44px 40px', transition: 'border-color 0.2s, box-shadow 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = T.border2; e.currentTarget.style.boxShadow = '0 12px 40px #00000040' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.boxShadow = 'none' }}
          >
            <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted2, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 14 }}>Free</div>
            <div style={{ fontFamily: T.mono, fontSize: 52, fontWeight: 700, color: T.text, marginBottom: 8, lineHeight: 1 }}>$0</div>
            <div style={{ fontSize: 13, color: T.text2, marginBottom: 36, lineHeight: 1.65, fontFamily: T.sans }}>2 full reports per month. No credit card, no API keys, no setup.</div>
            {['2 reports / month', 'Full DCF + Monte Carlo', 'Altman Z-Score + Piotroski F', 'Comps table + risk matrix', 'BUY / HOLD / SELL recommendation', 'PDF export'].map(f => (
              <div key={f} style={{ display: 'flex', gap: 10, marginBottom: 12, fontSize: 13, color: T.text2, fontFamily: T.sans }}>
                <span style={{ color: T.green, flexShrink: 0 }}>✓</span> {f}
              </div>
            ))}
            <SignUpButton mode="modal">
              <button
                style={{ display: 'block', width: '100%', marginTop: 36, background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)', color: '#000', border: 'none', borderRadius: 10, padding: '15px 0', fontFamily: T.mono, fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 20px #0ea5e930', transition: 'all 0.15s cubic-bezier(0.4,0,0.2,1)', letterSpacing: 0.3 }}
                onMouseEnter={e => { e.target.style.transform = 'scale(1.02)'; e.target.style.boxShadow = '0 6px 28px #0ea5e950' }}
                onMouseLeave={e => { e.target.style.transform = 'scale(1)'; e.target.style.boxShadow = '0 4px 20px #0ea5e930' }}
              >
                Get started free →
              </button>
            </SignUpButton>
          </div>

          {/* Pro */}
          <div style={{ background: T.panel, border: `1px solid ${T.accentBd}`, borderRadius: 18, padding: '44px 40px', position: 'relative', overflow: 'hidden', boxShadow: `0 0 40px ${T.accent}08` }}>
            {/* Shimmer border animation */}
            <div style={{ position: 'absolute', inset: 0, borderRadius: 18, background: `linear-gradient(135deg, transparent 40%, ${T.accent}20, transparent 60%)`, backgroundSize: '200% 200%', animation: 'shimmer 3s linear infinite', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', top: 0, right: 0, background: `linear-gradient(135deg, #0ea5e9, #38bdf8)`, color: '#000', fontFamily: T.mono, fontSize: 9, fontWeight: 700, padding: '6px 16px', borderRadius: '0 18px 0 8px', letterSpacing: 1.2 }}>
              COMING SOON
            </div>
            <div style={{ fontFamily: T.mono, fontSize: 10, color: T.accent, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 14 }}>Pro</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
              <span style={{ fontFamily: T.mono, fontSize: 52, fontWeight: 700, color: T.text, lineHeight: 1 }}>$49</span>
              <span style={{ fontFamily: T.mono, fontSize: 13, color: T.muted2 }}>/month</span>
            </div>
            <div style={{ fontSize: 13, color: T.text2, marginBottom: 36, lineHeight: 1.65, fontFamily: T.sans }}>No API keys. No limits. Priority AI models.</div>
            {['Unlimited reports', 'Cloud report history', 'Shareable report links', 'Priority AI (Claude Opus)', 'Team accounts (3 seats)', 'Advanced PDF exports'].map(f => (
              <div key={f} style={{ display: 'flex', gap: 10, marginBottom: 12, fontSize: 13, color: T.text2, fontFamily: T.sans }}>
                <span style={{ color: T.accent, flexShrink: 0 }}>✓</span> {f}
              </div>
            ))}
            {waitStatus === 'done' ? (
              <div style={{ marginTop: 36, padding: '15px 0', textAlign: 'center', fontFamily: T.mono, fontSize: 13, color: T.accent, background: T.accentLo, border: `1px solid ${T.accentBd}`, borderRadius: 10 }}>
                ✓ You're on the list
              </div>
            ) : (
              <form onSubmit={joinWaitlist} style={{ marginTop: 36, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  type="email"
                  value={waitEmail}
                  onChange={e => setWaitEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  style={{ width: '100%', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10, padding: '13px 16px', fontFamily: T.mono, fontSize: 13, color: T.text, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
                  onFocus={e => e.target.style.borderColor = T.accentBd}
                  onBlur={e => e.target.style.borderColor = T.border}
                />
                <button type="submit" disabled={waitStatus === 'loading'} style={{ width: '100%', background: T.accentLo, color: T.accent, border: `1px solid ${T.accentBd}`, borderRadius: 10, padding: '14px 0', fontFamily: T.mono, fontSize: 13, fontWeight: 700, cursor: waitStatus === 'loading' ? 'wait' : 'pointer', transition: 'all 0.15s', letterSpacing: 0.3 }}
                  onMouseEnter={e => { e.target.style.background = `${T.accent}20`; e.target.style.transform = 'scale(1.02)' }}
                  onMouseLeave={e => { e.target.style.background = T.accentLo; e.target.style.transform = 'scale(1)' }}
                >
                  {waitStatus === 'loading' ? 'Joining...' : 'Notify me when available'}
                </button>
                {waitStatus === 'error' && <div style={{ fontSize: 12, color: T.red, textAlign: 'center' }}>Something went wrong. Try again.</div>}
              </form>
            )}
          </div>
        </div>
      </div>
    </Section>
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
    <Section style={{ padding: '120px 24px', background: T.bg, borderTop: `1px solid ${T.border}` }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <SectionLabel>Who uses AXIOM</SectionLabel>
        <h2 style={{ fontFamily: T.sans, fontSize: 38, fontWeight: 800, color: T.text, letterSpacing: -1.5, textAlign: 'center', margin: '0 0 56px', lineHeight: 1.08 }}>
          Built for anyone who takes stocks seriously.
        </h2>
        <div className="usecases-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {cases.map((c, i) => (
            <div key={i} style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 14, padding: '32px 30px', transition: 'all 0.2s ease' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.accentBd; e.currentTarget.style.boxShadow = '0 8px 32px #00000040'; e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: T.accentLo, border: `1px solid ${T.accentBd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontFamily: T.mono, fontSize: 18, color: T.accent }}>{c.icon}</span>
                </div>
                <div style={{ fontFamily: T.sans, fontSize: 15, fontWeight: 700, color: T.text }}>{c.role}</div>
              </div>
              <div style={{ fontSize: 13, color: T.text2, lineHeight: 1.8, fontFamily: T.sans }}>{c.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}

// ─── Trust ────────────────────────────────────────────────────────────────────
function Trust() {
  return (
    <Section style={{ padding: '100px 24px', background: T.bg2, borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}` }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <SectionLabel>Security & privacy</SectionLabel>
        <div className="trust-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {[
            { icon: '◎', title: 'No data stored', desc: 'Reports are generated on-demand and not retained server-side. Your queries are private.' },
            { icon: '⬡', title: 'Auth via Clerk', desc: 'Industry-standard authentication with OAuth2. Supports Google, GitHub, X, and email.' },
            { icon: '◇', title: 'SEC EDGAR only', desc: 'All financial data is sourced exclusively from public SEC filings. No scraped or unverified data.' },
          ].map((t, i) => (
            <div key={i} style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 12, padding: '28px 24px', transition: 'all 0.2s ease' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.accentBd; e.currentTarget.style.boxShadow = '0 8px 32px #00000040' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.boxShadow = 'none' }}
            >
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: T.accentLo, border: `1px solid ${T.accentBd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <span style={{ fontFamily: T.mono, fontSize: 18, color: T.accent }}>{t.icon}</span>
              </div>
              <div style={{ fontFamily: T.sans, fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 10 }}>{t.title}</div>
              <div style={{ fontSize: 12, color: T.text2, lineHeight: 1.75, fontFamily: T.sans }}>{t.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </Section>
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
    <Section id="faq" style={{ padding: '120px 24px', background: T.bg, borderTop: `1px solid ${T.border}` }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <SectionLabel>FAQ</SectionLabel>
        <h2 style={{ fontFamily: T.sans, fontSize: 38, fontWeight: 800, color: T.text, letterSpacing: -1.5, textAlign: 'center', margin: '0 0 52px' }}>
          Common questions.
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {FAQS.map((f, i) => (
            <div key={i} style={{ background: T.panel, border: `1px solid ${open === i ? T.accentBd : T.border}`, borderRadius: 10, overflow: 'hidden', transition: 'border-color 0.2s', borderLeft: open === i ? `3px solid ${T.accent}` : `3px solid transparent` }}>
              <button onClick={() => setOpen(open === i ? null : i)} style={{ width: '100%', background: 'none', border: 'none', padding: '20px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ fontFamily: T.sans, fontSize: 14, fontWeight: 600, color: open === i ? T.text : T.text2 }}>{f.q}</span>
                <span style={{ fontFamily: T.mono, fontSize: 18, color: open === i ? T.accent : T.muted, marginLeft: 16, flexShrink: 0, transform: open === i ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s, color 0.2s' }}>+</span>
              </button>
              <div style={{ maxHeight: open === i ? '400px' : '0', overflow: 'hidden', transition: 'max-height 0.3s ease' }}>
                <div style={{ padding: '0 22px 20px', fontSize: 13, color: T.text2, lineHeight: 1.8, fontFamily: T.sans }}>{f.a}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}

// ─── Final CTA ────────────────────────────────────────────────────────────────
function FinalCTA({ navigate }) {
  const { isSignedIn } = useUser()
  return (
    <Section style={{ padding: '120px 24px', background: 'linear-gradient(135deg, #070a1a 0%, #0a1020 40%, #060918 100%)', borderTop: `1px solid ${T.border}`, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%)', width: 800, height: 400, background: `radial-gradient(ellipse, ${T.accent}12 0%, transparent 70%)`, zIndex: 0, pointerEvents: 'none' }} />
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 620, margin: '0 auto' }}>
        <h2 style={{ fontFamily: T.sans, fontSize: 'clamp(36px, 5vw, 52px)', fontWeight: 800, color: T.text, letterSpacing: -2, margin: '0 0 18px', lineHeight: 1.05 }}>
          Start your first<br />
          <span style={{ background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>free report now.</span>
        </h2>
        <p style={{ fontSize: 15, color: T.text2, margin: '0 auto 40px', lineHeight: 1.75, maxWidth: 440, fontFamily: T.sans }}>
          Institutional equity research on any US stock in under 60 seconds. No card. No setup.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          {isSignedIn ? (
            <button onClick={() => navigate('/app')}
              style={{ background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)', color: '#000', fontFamily: T.mono, fontSize: 14, fontWeight: 700, padding: '16px 40px', borderRadius: 10, border: 'none', cursor: 'pointer', letterSpacing: 0.3, boxShadow: '0 4px 24px #0ea5e940', transition: 'all 0.15s cubic-bezier(0.4,0,0.2,1)' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02) translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 32px #0ea5e960' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1) translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 24px #0ea5e940' }}
            >
              Open AXIOM →
            </button>
          ) : (
            <>
              <SignUpButton mode="modal">
                <button
                  style={{ background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)', color: '#000', fontFamily: T.mono, fontSize: 14, fontWeight: 700, padding: '16px 40px', borderRadius: 10, border: 'none', cursor: 'pointer', letterSpacing: 0.3, boxShadow: '0 4px 24px #0ea5e940', transition: 'all 0.15s cubic-bezier(0.4,0,0.2,1)' }}
                  onMouseEnter={e => { e.target.style.transform = 'scale(1.02) translateY(-1px)'; e.target.style.boxShadow = '0 8px 32px #0ea5e960' }}
                  onMouseLeave={e => { e.target.style.transform = 'scale(1) translateY(0)'; e.target.style.boxShadow = '0 4px 24px #0ea5e940' }}
                >
                  Generate a free report →
                </button>
              </SignUpButton>
              <SignInButton mode="modal">
                <button
                  style={{ background: 'transparent', color: T.text2, fontFamily: T.mono, fontSize: 13, padding: '16px 28px', borderRadius: 10, border: `1px solid ${T.border2}`, cursor: 'pointer', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.target.style.borderColor = T.accentBd; e.target.style.color = T.text }}
                  onMouseLeave={e => { e.target.style.borderColor = T.border2; e.target.style.color = T.text2 }}
                >
                  Sign in
                </button>
              </SignInButton>
            </>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 28, marginTop: 28, flexWrap: 'wrap' }}>
          {['Free forever', '2 reports/month', 'No credit card'].map(t => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: T.green, boxShadow: `0 0 6px ${T.green}` }} />
              <span style={{ fontFamily: T.mono, fontSize: 10, color: T.muted2 }}>{t}</span>
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer style={{ background: T.bg, borderTop: `1px solid ${T.border}`, padding: '40px 40px', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${T.accentBd}, transparent)` }} />
      <div style={{ maxWidth: 1060, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}>
        <div>
          <div style={{ fontFamily: T.mono, fontSize: 15, fontWeight: 700, color: T.accent, letterSpacing: 4, marginBottom: 8 }}>AXIOM</div>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted }}>Institutional Equity Research · Powered by SEC EDGAR</div>
        </div>
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
          {['Features', 'Pricing', 'FAQ'].map(item => (
            <a key={item} href={`#${item.toLowerCase()}`} style={{ fontFamily: T.sans, fontSize: 12, color: T.muted, textDecoration: 'none', transition: 'color 0.15s' }}
              onMouseEnter={e => e.target.style.color = T.text2}
              onMouseLeave={e => e.target.style.color = T.muted}
            >{item}</a>
          ))}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted, textAlign: 'right', lineHeight: 1.9 }}>
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
      @keyframes float { 0%, 100% { transform: translateY(0px) } 50% { transform: translateY(-8px) } }
      @keyframes shimmer { from { background-position: -200% 0 } to { background-position: 200% 0 } }
      @keyframes glow { 0%, 100% { box-shadow: 0 0 20px #0ea5e930 } 50% { box-shadow: 0 0 40px #0ea5e960 } }
      @media print { .no-print { display: none !important } body { background: #fff !important } }
      @media (max-width: 768px) {
        .hero-grid { grid-template-columns: 1fr !important; }
        .features-grid { grid-template-columns: 1fr !important; }
        .pricing-grid { grid-template-columns: 1fr !important; }
        .usecases-grid { grid-template-columns: 1fr !important; }
        .trust-grid { grid-template-columns: 1fr !important; }
        .stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
        .nav-links { display: none !important; }
        .hero-h1 { font-size: clamp(32px, 8vw, 56px) !important; }
      }
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
        <div className="no-print" style={{ background: T.accentLo, borderBottom: `1px solid ${T.accentBd}`, padding: '10px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontFamily: T.mono, fontSize: 11, color: T.accent }}>
            Demo · Groq llama-3.3-70b · 1 free preview / day
            <span style={{ color: T.muted2, marginLeft: 12 }}>Sign up for 2 full reports/month →</span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => { setReport(null); setTicker('') }} style={{ fontFamily: T.mono, fontSize: 11, color: T.muted2, background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 6, padding: '6px 14px', cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.target.style.borderColor = T.border2; e.target.style.color = T.text }}
              onMouseLeave={e => { e.target.style.borderColor = T.border; e.target.style.color = T.muted2 }}
            >← Back</button>
            <button onClick={() => navigate('/app')} style={{ fontFamily: T.mono, fontSize: 11, color: '#000', background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)', border: 'none', borderRadius: 6, padding: '6px 16px', cursor: 'pointer', fontWeight: 700, boxShadow: '0 2px 12px #0ea5e930' }}>Sign up free →</button>
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
