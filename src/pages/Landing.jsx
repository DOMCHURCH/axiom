import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import ResearchReport from '../components/ResearchReport.jsx'
import { SignInButton, SignUpButton, UserButton, useUser } from '@clerk/clerk-react'

// ─── Design Tokens ───────────────────────────────────────────────────────────
const T = {
  bg:       '#02040a',
  bg2:      '#060912',
  panel:    '#0a0e1a',
  panelHov: '#0d1220',
  border:   '#161d35',
  border2:  '#1f2d50',
  accent:   '#3b82f6',
  accentLo: '#3b82f608',
  accentBd: '#3b82f630',
  accentMid:'#3b82f660',
  cyan:     '#06b6d4',
  purple:   '#8b5cf6',
  green:    '#10b981',
  greenLo:  '#10b98115',
  red:      '#ef4444',
  gold:     '#f59e0b',
  text:     '#f8faff',
  text2:    '#8b9dc3',
  text3:    '#4d6080',
  muted:    '#2d3f60',
  muted2:   '#5d7aa0',
  mono:     "'IBM Plex Mono', 'Courier New', monospace",
  sans:     "'Inter', system-ui, sans-serif",
}

const clerkEnabled = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

function useInView(options = {}) {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setInView(true); obs.disconnect() }
    }, { threshold: 0.08, ...options })
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])
  return [ref, inView]
}

function Reveal({ children, delay = 0, style, ...props }) {
  const [ref, inView] = useInView()
  return (
    <div ref={ref} style={{
      opacity: inView ? 1 : 0,
      transform: inView ? 'translateY(0)' : 'translateY(32px)',
      transition: `opacity 0.7s ease ${delay}s, transform 0.7s ease ${delay}s`,
      ...style,
    }} {...props}>
      {children}
    </div>
  )
}

function Spinner() {
  return <div style={{ display: 'inline-block', width: 13, height: 13, border: `2px solid ${T.accent}30`, borderTopColor: T.accent, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
}

// ─── Ticker Strip ─────────────────────────────────────────────────────────────
const TICKERS = [
  { sym: 'AAPL', chg: +1.24, price: 213.48 }, { sym: 'NVDA', chg: +3.81, price: 875.20 },
  { sym: 'MSFT', chg: -0.42, price: 418.73 }, { sym: 'GOOGL', chg: +0.97, price: 182.91 },
  { sym: 'META', chg: +2.13, price: 521.34 }, { sym: 'AMZN', chg: -0.88, price: 195.67 },
  { sym: 'TSLA', chg: -1.54, price: 248.10 }, { sym: 'JPM', chg: +0.66, price: 209.84 },
  { sym: 'BRK.B', chg: +0.31, price: 437.22 }, { sym: 'NFLX', chg: +1.78, price: 684.30 },
]

function TickerStrip() {
  const items = [...TICKERS, ...TICKERS, ...TICKERS]
  return (
    <div style={{ overflow: 'hidden', padding: '10px 0', WebkitMaskImage: 'linear-gradient(90deg, transparent, black 8%, black 92%, transparent)', maskImage: 'linear-gradient(90deg, transparent, black 8%, black 92%, transparent)' }}>
      <div style={{ display: 'flex', animation: 'ticker 50s linear infinite', width: 'max-content' }}>
        {items.map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 28px', whiteSpace: 'nowrap' }}>
            <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 700, color: T.text3, letterSpacing: 1 }}>{t.sym}</span>
            <span style={{ fontFamily: T.mono, fontSize: 11, color: T.muted2 }}>${t.price.toFixed(2)}</span>
            <span style={{ fontFamily: T.mono, fontSize: 10, color: t.chg >= 0 ? T.green : T.red }}>{t.chg >= 0 ? '+' : ''}{t.chg.toFixed(2)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Report Mockup (compact) ──────────────────────────────────────────────────
function ReportMockup() {
  const sp = [142, 148, 145, 152, 158, 155, 161, 168, 165, 172, 178, 181]
  const min = Math.min(...sp), max = Math.max(...sp), range = max - min || 1
  const pts = sp.map((v, i) => `${(i / (sp.length - 1)) * 200},${36 - ((v - min) / range) * 36}`).join(' ')

  return (
    <div style={{
      background: 'linear-gradient(145deg, #0d1428 0%, #091022 100%)',
      border: `1px solid ${T.border2}`,
      borderRadius: 16,
      overflow: 'hidden',
      boxShadow: `0 0 0 1px ${T.border}, 0 60px 120px #00000080, 0 0 80px ${T.accent}0a`,
      fontFamily: T.mono,
    }}>
      {/* Top bar */}
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff5f5640' }} />
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ffbd2e40' }} />
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#27c93f40' }} />
          </div>
          <span style={{ fontSize: 10, color: T.text3, letterSpacing: 0.5 }}>axiom / research / NVDA</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#10b98118', border: '1px solid #10b98130', borderRadius: 4, padding: '3px 8px' }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: T.green, boxShadow: `0 0 6px ${T.green}` }} />
          <span style={{ fontSize: 9, color: T.green, fontWeight: 700, letterSpacing: 1 }}>BUY</span>
        </div>
      </div>

      {/* Header */}
      <div style={{ padding: '16px 18px 12px', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.text, letterSpacing: -0.5 }}>NVDA</div>
            <div style={{ fontSize: 9, color: T.text3, marginTop: 2 }}>NVIDIA Corporation · Generated 47s · FY 2024</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.green }}>$980</div>
            <div style={{ fontSize: 9, color: T.muted2, marginTop: 2 }}>+11.9% upside</div>
          </div>
        </div>
      </div>

      {/* Metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: `1px solid ${T.border}` }}>
        {[
          { l: 'Revenue', v: '$60.9B', s: '+122%', c: T.green },
          { l: 'EBITDA Mgn', v: '62.1%', s: '+18pp', c: T.green },
          { l: 'FCF', v: '$27.0B', s: '44.3%', c: T.text2 },
          { l: 'P/E', v: '34.2x', s: 'vs 28.1x', c: T.gold },
        ].map((m, i) => (
          <div key={i} style={{ padding: '10px 12px', borderRight: i < 3 ? `1px solid ${T.border}` : 'none' }}>
            <div style={{ fontSize: 8, color: T.text3, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5 }}>{m.l}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{m.v}</div>
            <div style={{ fontSize: 8, color: m.c, marginTop: 2 }}>{m.s}</div>
          </div>
        ))}
      </div>

      {/* DCF + Sparkline */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ padding: '12px 14px', borderRight: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 8, color: T.accent, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8 }}>DCF Model</div>
          {[['WACC', '9.2%'], ['Terminal Growth', '2.5%'], ['Intrinsic Value', '$946']].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 9, color: T.text3 }}>{k}</span>
              <span style={{ fontSize: 9, color: T.text, fontWeight: 600 }}>{v}</span>
            </div>
          ))}
          <div style={{ marginTop: 8, height: 3, background: T.border, borderRadius: 2 }}>
            <div style={{ width: '72%', height: '100%', background: `linear-gradient(90deg, ${T.green}, ${T.cyan})`, borderRadius: 2 }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
            <span style={{ fontSize: 7, color: T.text3 }}>P10 $840</span>
            <span style={{ fontSize: 7, color: T.text3 }}>P90 $1,140</span>
          </div>
        </div>
        <div style={{ padding: '12px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 8, color: T.text3, textTransform: 'uppercase', letterSpacing: 0.8 }}>Revenue 12M</span>
            <span style={{ fontSize: 9, color: T.green, fontWeight: 700 }}>+122%</span>
          </div>
          <svg width="100%" height="36" viewBox="0 0 200 36" style={{ display: 'block' }}>
            <defs>
              <linearGradient id="sg" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={T.green} stopOpacity="0.6" />
                <stop offset="100%" stopColor={T.cyan} />
              </linearGradient>
            </defs>
            <polyline points={pts} fill="none" stroke="url(#sg)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 8, color: T.text3, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Risk Flags</div>
            {[['Export controls', T.gold], ['Valuation premium', T.gold], ['Moat erosion', T.red]].map(([r, c]) => (
              <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                <div style={{ width: 4, height: 4, borderRadius: '50%', background: c, flexShrink: 0 }} />
                <span style={{ fontSize: 8, color: T.text3 }}>{r}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Analyst note */}
      <div style={{ padding: '12px 14px' }}>
        <div style={{ fontSize: 8, color: T.accent, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 }}>Analyst Note</div>
        <div style={{ fontSize: 10, color: T.text2, lineHeight: 1.7, fontStyle: 'italic', fontFamily: T.sans }}>
          "Data center delivered 217% growth to $47.5B. At 34.2x forward P/E vs. 62% EBITDA margins, premium justified. Initiating BUY, $980 target."
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
    const fn = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', fn)
    return () => window.removeEventListener('scroll', fn)
  }, [])

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 32px', height: 56,
      background: scrolled ? `${T.bg}ee` : 'transparent',
      borderBottom: scrolled ? `1px solid ${T.border}` : '1px solid transparent',
      backdropFilter: scrolled ? 'blur(24px) saturate(160%)' : 'none',
      transition: 'all 0.3s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
        <div style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 700, color: T.text, letterSpacing: 6, cursor: 'pointer' }}>
          AXIOM
        </div>
        <div className="nav-links" style={{ display: 'flex', gap: 28 }}>
          {['Features', 'Pricing', 'FAQ'].map(item => (
            <a key={item} href={`#${item.toLowerCase()}`}
              style={{ fontFamily: T.sans, fontSize: 13, color: T.text3, textDecoration: 'none', transition: 'color 0.15s' }}
              onMouseEnter={e => e.target.style.color = T.text2}
              onMouseLeave={e => e.target.style.color = T.text3}
            >{item}</a>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {clerkEnabled && !isSignedIn && (
          <>
            <SignInButton mode="modal">
              <button style={{ fontFamily: T.sans, fontSize: 13, color: T.text3, background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px 12px', transition: 'color 0.15s' }}
                onMouseEnter={e => e.target.style.color = T.text2}
                onMouseLeave={e => e.target.style.color = T.text3}
              >Sign in</button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button style={{ fontFamily: T.sans, fontSize: 13, color: T.text, background: 'transparent', border: `1px solid ${T.border2}`, borderRadius: 8, padding: '7px 18px', cursor: 'pointer', fontWeight: 500, transition: 'all 0.15s' }}
                onMouseEnter={e => { e.target.style.borderColor = T.accent; e.target.style.color = T.accent }}
                onMouseLeave={e => { e.target.style.borderColor = T.border2; e.target.style.color = T.text }}
              >Get started →</button>
            </SignUpButton>
          </>
        )}
        {clerkEnabled && isSignedIn && <UserButton afterSignOutUrl="/" />}
      </div>
    </nav>
  )
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
function Hero({ navigate, runDemo, ticker, setTicker, loading, progress, progressPct, error }) {
  const inputRef = useRef(null)
  const { isSignedIn } = useUser()
  const [inputFocused, setInputFocused] = useState(false)
  const POPULAR = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META', 'TSLA']

  function handleGenerate(t) {
    if (!t?.trim()) return
    const sym = t.trim().toUpperCase()
    if (isSignedIn) navigate(`/app?q=${sym}`)
    else runDemo(sym)
  }

  return (
    <section style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '120px 24px 80px', position: 'relative', overflow: 'hidden', textAlign: 'center' }}>
      {/* Gradient mesh background */}
      <div style={{ position: 'absolute', inset: 0, background: `
        radial-gradient(ellipse 80% 50% at 20% 10%, #1d2f6620 0%, transparent 60%),
        radial-gradient(ellipse 60% 40% at 80% 20%, #3b82f612 0%, transparent 55%),
        radial-gradient(ellipse 50% 60% at 50% 100%, #06b6d408 0%, transparent 50%)
      `, zIndex: 0 }} />
      {/* Fine grid */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(${T.border} 1px, transparent 1px), linear-gradient(90deg, ${T.border} 1px, transparent 1px)`, backgroundSize: '60px 60px', zIndex: 0, opacity: 0.25 }} />
      {/* Bottom fade */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 300, background: `linear-gradient(to bottom, transparent, ${T.bg})`, zIndex: 1 }} />

      <div style={{ position: 'relative', zIndex: 2, maxWidth: 860, width: '100%' }}>
        {/* Status badge */}
        <div style={{ animation: 'fadeUp 0.5s ease both', marginBottom: 28, display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(59,130,246,0.06)', border: `1px solid rgba(59,130,246,0.18)`, borderRadius: 99, padding: '6px 14px' }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: T.green, boxShadow: `0 0 8px ${T.green}` }} />
          <span style={{ fontFamily: T.mono, fontSize: 10, color: T.text3, letterSpacing: 1.5 }}>LIVE · SEC EDGAR · REAL-TIME DATA</span>
        </div>

        {/* Headline */}
        <h1 style={{ animation: 'fadeUp 0.5s ease 0.05s both', fontFamily: T.sans, fontSize: 'clamp(48px, 7vw, 88px)', fontWeight: 800, letterSpacing: -3, lineHeight: 1, margin: '0 0 24px', color: T.text }}>
          Institutional equity<br />research in{' '}
          <span style={{ background: `linear-gradient(135deg, ${T.accent} 0%, ${T.cyan} 50%, ${T.purple} 100%)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            60 seconds.
          </span>
        </h1>

        {/* Sub */}
        <p style={{ animation: 'fadeUp 0.5s ease 0.1s both', fontFamily: T.sans, fontSize: 17, color: T.text2, lineHeight: 1.75, margin: '0 auto 44px', maxWidth: 560 }}>
          Full DCF models, Monte Carlo simulation, comparable company analysis, and BUY/HOLD/SELL recommendations — powered by live SEC EDGAR filings.
        </p>

        {/* Search */}
        <div style={{ animation: 'fadeUp 0.5s ease 0.15s both', maxWidth: 520, margin: '0 auto' }}>
          <form onSubmit={e => { e.preventDefault(); handleGenerate(ticker) }}>
            <div style={{ display: 'flex', gap: 0, marginBottom: 14, background: T.panel, border: `1px solid ${inputFocused ? T.accent + '50' : T.border2}`, borderRadius: 12, overflow: 'hidden', boxShadow: inputFocused ? `0 0 0 3px ${T.accent}15, 0 16px 40px #00000040` : '0 8px 32px #00000040', transition: 'all 0.2s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px', borderRight: `1px solid ${T.border}` }}>
                <span style={{ fontFamily: T.mono, fontSize: 14, color: T.text3 }}>$</span>
              </div>
              <input
                ref={inputRef}
                type="text"
                placeholder="Enter a ticker: AAPL, NVDA, MSFT..."
                value={ticker}
                onChange={e => setTicker(e.target.value.toUpperCase().replace(/[^A-Z.]/g, ''))}
                disabled={loading}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                style={{ flex: 1, background: 'transparent', border: 'none', padding: '16px 14px', color: T.text, fontFamily: T.mono, fontSize: 14, outline: 'none' }}
              />
              <button type="submit" disabled={loading || !ticker.trim()} style={{
                background: loading || !ticker.trim() ? 'transparent' : `linear-gradient(135deg, ${T.accent}, ${T.cyan})`,
                color: loading || !ticker.trim() ? T.text3 : '#fff',
                border: 'none', padding: '0 24px',
                fontFamily: T.mono, fontSize: 12, fontWeight: 700,
                cursor: loading || !ticker.trim() ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 8,
                transition: 'all 0.15s ease', letterSpacing: 0.5,
                borderLeft: `1px solid ${T.border}`,
              }}>
                {loading ? <><Spinner /> Running...</> : isSignedIn ? 'Analyze →' : 'Preview →'}
              </button>
            </div>
          </form>

          {loading && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ height: 2, background: T.border, borderRadius: 1, overflow: 'hidden', marginBottom: 6 }}>
                <div style={{ height: '100%', background: `linear-gradient(90deg, ${T.accent}, ${T.cyan})`, width: progressPct + '%', transition: 'width 0.5s ease', borderRadius: 1 }} />
              </div>
              <div style={{ fontFamily: T.mono, fontSize: 11, color: T.accent, animation: 'pulse 1.5s infinite', textAlign: 'left' }}>{progress}</div>
            </div>
          )}

          {error && !error.includes('limit') && (
            <div style={{ background: T.red + '10', border: `1px solid ${T.red}25`, borderRadius: 8, padding: '10px 14px', fontFamily: T.mono, fontSize: 11, color: T.red, marginBottom: 14, textAlign: 'left' }}>
              ⚠ {error}
            </div>
          )}

          {/* Popular tickers */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: T.mono, fontSize: 10, color: T.text3 }}>Try:</span>
            {POPULAR.map(t => (
              <button key={t} onClick={() => { setTicker(t); handleGenerate(t) }}
                style={{ fontFamily: T.mono, fontSize: 10, color: T.text3, background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 6, padding: '3px 10px', cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = T.accentBd; e.currentTarget.style.color = T.accent }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.text3 }}
              >{t}</button>
            ))}
          </div>
        </div>

        {/* Trust */}
        <div style={{ animation: 'fadeUp 0.5s ease 0.2s both', display: 'flex', gap: 24, justifyContent: 'center', marginTop: 24, flexWrap: 'wrap' }}>
          {['Free — no card required', 'No API keys', 'Real SEC filings'].map(t => (
            <span key={t} style={{ fontFamily: T.mono, fontSize: 10, color: T.text3, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: T.green }}>✓</span> {t}
            </span>
          ))}
        </div>
      </div>

      {/* Mockup below */}
      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 700, marginTop: 64, animation: 'fadeUp 0.6s ease 0.3s both' }}>
        <div style={{ position: 'absolute', top: -60, left: '50%', transform: 'translateX(-50%)', width: 600, height: 200, background: `radial-gradient(ellipse, ${T.accent}18 0%, transparent 70%)`, pointerEvents: 'none', zIndex: -1 }} />
        <ReportMockup />
      </div>
    </section>
  )
}

// ─── Logo Bar ─────────────────────────────────────────────────────────────────
function LogoBar() {
  return (
    <div style={{ padding: '32px 24px', borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}` }}>
      <div style={{ maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontFamily: T.mono, fontSize: 9, color: T.text3, letterSpacing: 2, marginBottom: 20, textTransform: 'uppercase' }}>Data sourced directly from</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 48, flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            { name: 'SEC EDGAR', sub: 'XBRL Filings' },
            { name: 'NYSE', sub: '5,000+ Stocks' },
            { name: 'NASDAQ', sub: '3,400+ Stocks' },
            { name: 'Groq', sub: 'AI Inference' },
            { name: 'Clerk', sub: 'Auth' },
          ].map(({ name, sub }) => (
            <div key={name} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 700, color: T.text3, letterSpacing: 1 }}>{name}</div>
              <div style={{ fontFamily: T.mono, fontSize: 9, color: T.muted, marginTop: 2 }}>{sub}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Bento Features ───────────────────────────────────────────────────────────
function Features() {
  return (
    <section id="features" style={{ padding: '120px 24px', background: T.bg2 }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <Reveal style={{ textAlign: 'center', marginBottom: 64 }}>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: T.accent, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14 }}>What AXIOM produces</div>
          <h2 style={{ fontFamily: T.sans, fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: 800, color: T.text, letterSpacing: -2, margin: 0, lineHeight: 1.05 }}>
            Six analyses.<br />One report.
          </h2>
        </Reveal>

        {/* Bento grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gridTemplateRows: 'auto', gap: 12 }} className="bento-grid">
          {/* Big DCF card */}
          <Reveal delay={0} style={{ gridColumn: 'span 4', background: T.panel, border: `1px solid ${T.border}`, borderRadius: 16, padding: '36px 40px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, right: 0, width: 200, height: 200, background: `radial-gradient(circle, ${T.accent}08 0%, transparent 70%)`, pointerEvents: 'none' }} />
            <div style={{ fontFamily: T.mono, fontSize: 10, color: T.accent, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 }}>01 — Valuation</div>
            <div style={{ fontFamily: T.sans, fontSize: 24, fontWeight: 700, color: T.text, marginBottom: 10, letterSpacing: -0.5 }}>DCF + Monte Carlo</div>
            <div style={{ fontSize: 13, color: T.text2, lineHeight: 1.75, maxWidth: 380, marginBottom: 28 }}>8-year two-stage discounted cash flow model with 2,000 Monte Carlo trials. Get the full P10–P90 value distribution, not just a single price target.</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['WACC sensitivity', 'Terminal growth', 'Probability distribution', 'Bear/base/bull'].map(t => (
                <span key={t} style={{ fontFamily: T.mono, fontSize: 9, color: T.text3, background: `${T.accent}08`, border: `1px solid ${T.border2}`, borderRadius: 4, padding: '3px 8px' }}>{t}</span>
              ))}
            </div>
          </Reveal>

          {/* Score card */}
          <Reveal delay={0.05} style={{ gridColumn: 'span 2', background: T.panel, border: `1px solid ${T.border}`, borderRadius: 16, padding: '32px 28px' }}>
            <div style={{ fontFamily: T.mono, fontSize: 10, color: T.purple, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 }}>02 — Risk</div>
            <div style={{ fontFamily: T.sans, fontSize: 20, fontWeight: 700, color: T.text, marginBottom: 10 }}>Altman Z-Score</div>
            <div style={{ fontSize: 12, color: T.text2, lineHeight: 1.7, marginBottom: 20 }}>Five-factor bankruptcy prediction model. Flags financial distress risk instantly.</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {['Safe', 'Grey', 'Distress'].map((z, i) => (
                <div key={z} style={{ flex: 1, padding: '8px 6px', background: i === 0 ? `${T.green}12` : i === 1 ? `${T.gold}12` : `${T.red}12`, border: `1px solid ${i === 0 ? T.green : i === 1 ? T.gold : T.red}25`, borderRadius: 6, textAlign: 'center' }}>
                  <div style={{ fontFamily: T.mono, fontSize: 8, color: i === 0 ? T.green : i === 1 ? T.gold : T.red, fontWeight: 700 }}>{z}</div>
                </div>
              ))}
            </div>
          </Reveal>

          {/* SEC data */}
          <Reveal delay={0.08} style={{ gridColumn: 'span 2', background: `linear-gradient(145deg, #0d1428, #091022)`, border: `1px solid ${T.border}`, borderRadius: 16, padding: '32px 28px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ fontFamily: T.mono, fontSize: 10, color: T.cyan, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 }}>03 — Data</div>
            <div style={{ fontFamily: T.sans, fontSize: 20, fontWeight: 700, color: T.text, marginBottom: 10 }}>Live SEC EDGAR</div>
            <div style={{ fontSize: 12, color: T.text2, lineHeight: 1.7 }}>Revenue, margins, FCF, balance sheet from official XBRL filings. No third-party data vendors.</div>
            <div style={{ marginTop: 20, fontFamily: T.mono, fontSize: 10, lineHeight: 2 }}>
              {['✓ 10-K annual filings', '✓ 10-Q quarterly filings', '✓ Real-time price data'].map(f => (
                <div key={f} style={{ color: T.green }}>{f}</div>
              ))}
            </div>
          </Reveal>

          {/* Comps */}
          <Reveal delay={0.1} style={{ gridColumn: 'span 2', background: T.panel, border: `1px solid ${T.border}`, borderRadius: 16, padding: '32px 28px' }}>
            <div style={{ fontFamily: T.mono, fontSize: 10, color: T.accent, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 }}>04 — Analysis</div>
            <div style={{ fontFamily: T.sans, fontSize: 20, fontWeight: 700, color: T.text, marginBottom: 10 }}>Comps Table</div>
            <div style={{ fontSize: 12, color: T.text2, lineHeight: 1.7 }}>Comparable company analysis with EV/EBITDA, P/E, revenue growth across 3 sector peers.</div>
          </Reveal>

          {/* Piotroski */}
          <Reveal delay={0.12} style={{ gridColumn: 'span 2', background: T.panel, border: `1px solid ${T.border}`, borderRadius: 16, padding: '32px 28px' }}>
            <div style={{ fontFamily: T.mono, fontSize: 10, color: T.purple, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 }}>05 — Quality</div>
            <div style={{ fontFamily: T.sans, fontSize: 20, fontWeight: 700, color: T.text, marginBottom: 10 }}>Piotroski F-Score</div>
            <div style={{ fontSize: 12, color: T.text2, lineHeight: 1.7 }}>9-point quality screen across profitability, leverage, and operating efficiency.</div>
            <div style={{ display: 'flex', gap: 3, marginTop: 18 }}>
              {Array.from({ length: 9 }, (_, i) => (
                <div key={i} style={{ flex: 1, height: 20, background: i < 7 ? `linear-gradient(180deg, ${T.green}, ${T.green}80)` : T.border, borderRadius: 3 }} />
              ))}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: 9, color: T.green, marginTop: 6 }}>7/9 — Strong Quality</div>
          </Reveal>

          {/* Recommendation */}
          <Reveal delay={0.14} style={{ gridColumn: 'span 2', background: `linear-gradient(145deg, #0d1a10, #091022)`, border: `1px solid ${T.green}25`, borderRadius: 16, padding: '32px 28px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -20, right: -20, width: 120, height: 120, background: `radial-gradient(circle, ${T.green}15 0%, transparent 70%)` }} />
            <div style={{ fontFamily: T.mono, fontSize: 10, color: T.green, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 }}>06 — Output</div>
            <div style={{ fontFamily: T.sans, fontSize: 20, fontWeight: 700, color: T.text, marginBottom: 10 }}>BUY / HOLD / SELL</div>
            <div style={{ fontSize: 12, color: T.text2, lineHeight: 1.7 }}>Clear recommendation with 12-month price target and upside, grounded in the model.</div>
            <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
              {[['BUY', T.green], ['HOLD', T.gold], ['SELL', T.red]].map(([r, c]) => (
                <div key={r} style={{ flex: 1, padding: '8px 0', background: `${c}12`, border: `1px solid ${c}30`, borderRadius: 6, textAlign: 'center', fontFamily: T.mono, fontSize: 11, color: c, fontWeight: 700 }}>{r}</div>
              ))}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

// ─── How It Works ─────────────────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    { n: '01', title: 'Enter any ticker', desc: 'Type any US-listed stock symbol. NYSE, NASDAQ, or OTC — if it files with the SEC, AXIOM covers it.' },
    { n: '02', title: 'EDGAR data pulled live', desc: 'AXIOM fetches 10-K and 10-Q XBRL filings from the SEC in real-time. No cached data, no stale exports.' },
    { n: '03', title: 'AI builds the model', desc: 'A two-pass analysis: first, chain-of-thought reasoning. Then structured JSON extraction for every section.' },
    { n: '04', title: 'Full report in 60s', desc: 'DCF model, comps table, risk matrix, and a final analyst note — all in one structured research note.' },
  ]
  return (
    <section style={{ padding: '120px 24px', background: T.bg, borderTop: `1px solid ${T.border}` }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <Reveal style={{ textAlign: 'center', marginBottom: 72 }}>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: T.accent, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14 }}>How it works</div>
          <h2 style={{ fontFamily: T.sans, fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, color: T.text, letterSpacing: -1.5, margin: 0 }}>Four steps. Sixty seconds.</h2>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, position: 'relative' }} className="steps-grid">
          {/* Connector line */}
          <div style={{ position: 'absolute', top: 28, left: '12.5%', right: '12.5%', height: 1, background: `linear-gradient(90deg, transparent, ${T.border2}, ${T.border2}, transparent)`, zIndex: 0 }} />
          {steps.map((s, i) => (
            <Reveal key={i} delay={i * 0.07} style={{ padding: '0 20px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: T.panel, border: `1px solid ${T.border2}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: `0 0 0 4px ${T.bg}` }}>
                <span style={{ fontFamily: T.mono, fontSize: 12, fontWeight: 700, color: T.accent }}>{s.n}</span>
              </div>
              <div style={{ fontFamily: T.sans, fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 10 }}>{s.title}</div>
              <div style={{ fontSize: 12, color: T.text2, lineHeight: 1.75 }}>{s.desc}</div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Pricing ──────────────────────────────────────────────────────────────────
function Pricing({ navigate }) {
  const { isSignedIn } = useUser()
  const [waitEmail, setWaitEmail] = useState('')
  const [waitStatus, setWaitStatus] = useState('')

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
    <section id="pricing" style={{ padding: '120px 24px', background: T.bg2, borderTop: `1px solid ${T.border}` }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <Reveal style={{ textAlign: 'center', marginBottom: 64 }}>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: T.accent, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14 }}>Pricing</div>
          <h2 style={{ fontFamily: T.sans, fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, color: T.text, letterSpacing: -1.5, margin: 0 }}>Simple pricing. Start free.</h2>
        </Reveal>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} className="pricing-grid">
          {/* Free */}
          <Reveal delay={0} style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 20, padding: '40px 36px' }}>
            <div style={{ fontFamily: T.mono, fontSize: 10, color: T.text3, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16 }}>Free</div>
            <div style={{ fontFamily: T.mono, fontSize: 56, fontWeight: 700, color: T.text, lineHeight: 1, marginBottom: 6 }}>$0</div>
            <div style={{ fontSize: 13, color: T.text2, marginBottom: 32, lineHeight: 1.65 }}>2 reports per month. No card, no API keys.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
              {['2 reports / month', 'Full DCF + Monte Carlo', 'Altman Z + Piotroski F', 'Comps + risk matrix', 'BUY/HOLD/SELL output'].map(f => (
                <div key={f} style={{ display: 'flex', gap: 10, fontSize: 13, color: T.text2 }}>
                  <span style={{ color: T.green, flexShrink: 0 }}>✓</span> {f}
                </div>
              ))}
            </div>
            <SignUpButton mode="modal">
              <button style={{ display: 'block', width: '100%', background: 'transparent', color: T.text, border: `1px solid ${T.border2}`, borderRadius: 10, padding: '14px 0', fontFamily: T.mono, fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s', letterSpacing: 0.3 }}
                onMouseEnter={e => { e.target.style.borderColor = T.accent + '60'; e.target.style.color = T.accent }}
                onMouseLeave={e => { e.target.style.borderColor = T.border2; e.target.style.color = T.text }}
              >Get started free →</button>
            </SignUpButton>
          </Reveal>

          {/* Pro */}
          <Reveal delay={0.08} style={{ background: `linear-gradient(145deg, #0d1428 0%, #091022 100%)`, border: `1px solid ${T.accentBd}`, borderRadius: 20, padding: '40px 36px', position: 'relative', overflow: 'hidden', boxShadow: `0 0 60px ${T.accent}0a` }}>
            <div style={{ position: 'absolute', top: 0, right: 0, background: T.accent, color: '#fff', fontFamily: T.mono, fontSize: 8, fontWeight: 700, padding: '5px 14px', borderRadius: '0 20px 0 8px', letterSpacing: 1.5 }}>COMING SOON</div>
            <div style={{ fontFamily: T.mono, fontSize: 10, color: T.accent, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16 }}>Pro</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
              <span style={{ fontFamily: T.mono, fontSize: 56, fontWeight: 700, color: T.text, lineHeight: 1 }}>$49</span>
              <span style={{ fontFamily: T.mono, fontSize: 12, color: T.text3 }}>/month</span>
            </div>
            <div style={{ fontSize: 13, color: T.text2, marginBottom: 32, lineHeight: 1.65 }}>No limits. Priority AI. Team access.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
              {['Unlimited reports', 'Cloud report history', 'Shareable report links', 'Priority AI (Claude Opus)', 'Team accounts (3 seats)', 'Advanced PDF exports'].map(f => (
                <div key={f} style={{ display: 'flex', gap: 10, fontSize: 13, color: T.text2 }}>
                  <span style={{ color: T.accent, flexShrink: 0 }}>✓</span> {f}
                </div>
              ))}
            </div>
            {waitStatus === 'done' ? (
              <div style={{ padding: '14px 0', textAlign: 'center', fontFamily: T.mono, fontSize: 12, color: T.accent, background: T.accentLo, border: `1px solid ${T.accentBd}`, borderRadius: 10 }}>
                ✓ You're on the list
              </div>
            ) : (
              <form onSubmit={joinWaitlist} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input type="email" value={waitEmail} onChange={e => setWaitEmail(e.target.value)} placeholder="your@email.com" required
                  style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, padding: '12px 14px', fontFamily: T.mono, fontSize: 12, color: T.text, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s', width: '100%' }}
                  onFocus={e => e.target.style.borderColor = T.accentBd}
                  onBlur={e => e.target.style.borderColor = T.border}
                />
                <button type="submit" disabled={waitStatus === 'loading'} style={{ background: `linear-gradient(135deg, ${T.accent}, ${T.cyan})`, color: '#fff', border: 'none', borderRadius: 8, padding: '13px 0', fontFamily: T.mono, fontSize: 12, fontWeight: 700, cursor: waitStatus === 'loading' ? 'wait' : 'pointer', letterSpacing: 0.5 }}>
                  {waitStatus === 'loading' ? 'Joining...' : 'Join the waitlist'}
                </button>
                {waitStatus === 'error' && <div style={{ fontSize: 11, color: T.red, textAlign: 'center' }}>Something went wrong.</div>}
              </form>
            )}
          </Reveal>
        </div>
      </div>
    </section>
  )
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────
const FAQS = [
  { q: 'How accurate are the reports?', a: 'AXIOM sources all financial data directly from SEC EDGAR\'s structured XBRL database — the same data Bloomberg and FactSet use. The AI analysis is based entirely on that data. As with any model, outputs should be used as a starting point, not a final investment decision.' },
  { q: 'Which stocks does AXIOM cover?', a: 'Any US-listed company that files with the SEC — NYSE, NASDAQ, and OTC markets. This includes all S&P 500 companies, mid-caps, and most small-caps with XBRL-formatted filings.' },
  { q: 'How is AXIOM different from a screener?', a: 'Screeners give you tables of numbers. AXIOM produces a full written research note — with a DCF model, comparable company analysis, risk matrix, and an investment recommendation — the same output a junior analyst spends hours on.' },
  { q: 'Do I need my own AI API key?', a: 'No. AXIOM runs entirely on our infrastructure. Sign up and generate reports immediately — no keys, no configuration, no setup.' },
  { q: 'What does the free plan include?', a: '2 complete, full-length equity research reports per month. Every section included: DCF, Monte Carlo, comps, risk matrix, analyst note. No features paywalled on free tier.' },
  { q: 'When is Pro launching?', a: 'Soon. Pro will include unlimited reports, cloud history, shareable links, and priority AI models. Join the waitlist above to get notified.' },
]

function FAQ() {
  const [open, setOpen] = useState(null)
  return (
    <section id="faq" style={{ padding: '120px 24px', background: T.bg, borderTop: `1px solid ${T.border}` }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <Reveal style={{ textAlign: 'center', marginBottom: 60 }}>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: T.accent, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14 }}>FAQ</div>
          <h2 style={{ fontFamily: T.sans, fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, color: T.text, letterSpacing: -1.5, margin: 0 }}>Common questions.</h2>
        </Reveal>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {FAQS.map((f, i) => (
            <div key={i} style={{ border: `1px solid ${open === i ? T.border2 : T.border}`, borderRadius: 10, overflow: 'hidden', transition: 'border-color 0.2s' }}>
              <button onClick={() => setOpen(open === i ? null : i)} style={{ width: '100%', background: open === i ? T.panel : 'transparent', border: 'none', padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s' }}>
                <span style={{ fontFamily: T.sans, fontSize: 14, fontWeight: 500, color: open === i ? T.text : T.text2 }}>{f.q}</span>
                <span style={{ fontFamily: T.mono, fontSize: 16, color: open === i ? T.accent : T.text3, marginLeft: 16, flexShrink: 0, transform: open === i ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s, color 0.2s' }}>+</span>
              </button>
              <div style={{ maxHeight: open === i ? '300px' : '0', overflow: 'hidden', transition: 'max-height 0.3s ease' }}>
                <div style={{ padding: '0 20px 18px', fontSize: 13, color: T.text2, lineHeight: 1.8 }}>{f.a}</div>
              </div>
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
    <section style={{ padding: '140px 24px', background: T.bg2, borderTop: `1px solid ${T.border}`, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 700, height: 400, background: `radial-gradient(ellipse, ${T.accent}10 0%, transparent 70%)`, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(${T.border} 1px, transparent 1px), linear-gradient(90deg, ${T.border} 1px, transparent 1px)`, backgroundSize: '60px 60px', opacity: 0.15 }} />
      <Reveal style={{ position: 'relative', zIndex: 1, maxWidth: 600, margin: '0 auto' }}>
        <h2 style={{ fontFamily: T.sans, fontSize: 'clamp(36px, 5vw, 60px)', fontWeight: 800, color: T.text, letterSpacing: -2.5, margin: '0 0 18px', lineHeight: 1 }}>
          Start your first<br />
          <span style={{ background: `linear-gradient(135deg, ${T.accent}, ${T.cyan})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>free report now.</span>
        </h2>
        <p style={{ fontSize: 16, color: T.text2, margin: '0 auto 40px', lineHeight: 1.75, maxWidth: 420 }}>
          Institutional-grade equity research on any US stock in under 60 seconds.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          {isSignedIn ? (
            <button onClick={() => navigate('/app')}
              style={{ background: `linear-gradient(135deg, ${T.accent}, ${T.cyan})`, color: '#fff', fontFamily: T.mono, fontSize: 13, fontWeight: 700, padding: '16px 40px', borderRadius: 10, border: 'none', cursor: 'pointer', letterSpacing: 0.5, boxShadow: `0 4px 32px ${T.accent}30`, transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 40px ${T.accent}50` }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = `0 4px 32px ${T.accent}30` }}
            >Open AXIOM →</button>
          ) : (
            <>
              <SignUpButton mode="modal">
                <button style={{ background: `linear-gradient(135deg, ${T.accent}, ${T.cyan})`, color: '#fff', fontFamily: T.mono, fontSize: 13, fontWeight: 700, padding: '16px 36px', borderRadius: 10, border: 'none', cursor: 'pointer', letterSpacing: 0.5, boxShadow: `0 4px 32px ${T.accent}30`, transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.target.style.transform = 'translateY(-2px)'; e.target.style.boxShadow = `0 8px 40px ${T.accent}50` }}
                  onMouseLeave={e => { e.target.style.transform = 'translateY(0)'; e.target.style.boxShadow = `0 4px 32px ${T.accent}30` }}
                >Generate a free report →</button>
              </SignUpButton>
              <SignInButton mode="modal">
                <button style={{ background: 'transparent', color: T.text2, fontFamily: T.mono, fontSize: 13, padding: '16px 24px', borderRadius: 10, border: `1px solid ${T.border2}`, cursor: 'pointer', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.target.style.borderColor = T.accentBd; e.target.style.color = T.text }}
                  onMouseLeave={e => { e.target.style.borderColor = T.border2; e.target.style.color = T.text2 }}
                >Sign in</button>
              </SignInButton>
            </>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 24, flexWrap: 'wrap' }}>
          {['Free forever', '2 reports/month', 'No credit card'].map(t => (
            <span key={t} style={{ fontFamily: T.mono, fontSize: 10, color: T.text3, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: T.green }}>✓</span> {t}
            </span>
          ))}
        </div>
      </Reveal>
    </section>
  )
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer style={{ background: T.bg, borderTop: `1px solid ${T.border}`, padding: '32px 40px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 700, color: T.text, letterSpacing: 5, marginBottom: 6 }}>AXIOM</div>
          <div style={{ fontFamily: T.mono, fontSize: 9, color: T.text3 }}>Equity Research · SEC EDGAR · Not investment advice</div>
        </div>
        <div style={{ display: 'flex', gap: 28 }}>
          {['Features', 'Pricing', 'FAQ'].map(item => (
            <a key={item} href={`#${item.toLowerCase()}`} style={{ fontFamily: T.sans, fontSize: 12, color: T.text3, textDecoration: 'none', transition: 'color 0.15s' }}
              onMouseEnter={e => e.target.style.color = T.text2}
              onMouseLeave={e => e.target.style.color = T.text3}
            >{item}</a>
          ))}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 9, color: T.text3 }}>
          Built on Vercel + Neon + Groq
        </div>
      </div>
    </footer>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
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
      @keyframes ticker { from { transform: translateX(0) } to { transform: translateX(-33.33%) } }
      @keyframes fadeUp { from { opacity: 0; transform: translateY(24px) } to { opacity: 1; transform: translateY(0) } }
      @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }
      @media (max-width: 768px) {
        .bento-grid { grid-template-columns: 1fr !important; }
        .bento-grid > * { grid-column: span 1 !important; }
        .pricing-grid { grid-template-columns: 1fr !important; }
        .steps-grid { grid-template-columns: 1fr 1fr !important; }
        .nav-links { display: none !important; }
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
      const aiRes = await fetch('/api/demo-ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticker: sym, financials: edgarData.financials }) })
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

  if (report) {
    return (
      <div style={{ minHeight: '100vh', background: T.bg, color: T.text }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeIn{from{opacity:0}to{opacity:1}}`}</style>
        <div style={{ background: `${T.accent}0d`, borderBottom: `1px solid ${T.accentBd}`, padding: '10px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontFamily: T.mono, fontSize: 11, color: T.accent }}>
            Demo · 1 free preview/day · <span style={{ color: T.text3 }}>Sign up for 2 full reports/month</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setReport(null); setTicker('') }} style={{ fontFamily: T.mono, fontSize: 11, color: T.text2, background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }}>← Back</button>
            <button onClick={() => navigate('/app')} style={{ fontFamily: T.mono, fontSize: 11, color: '#fff', background: `linear-gradient(135deg, ${T.accent}, ${T.cyan})`, border: 'none', borderRadius: 6, padding: '6px 16px', cursor: 'pointer', fontWeight: 700 }}>Sign up free →</button>
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
      <LogoBar />
      <Features />
      <HowItWorks />
      <Pricing navigate={navigate} />
      <FAQ />
      <FinalCTA navigate={navigate} />
      <Footer />
    </div>
  )
}
