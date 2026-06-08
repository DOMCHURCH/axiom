import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import ResearchReport from '../components/ResearchReport.jsx'
import { SignInButton, SignUpButton, UserButton, useUser } from '@clerk/clerk-react'
import { brand as T, ease as EASE } from '../lib/tokens.js'

const clerkEnabled = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

function useInView(threshold = 0.1, once = true) {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setInView(true); if (once) obs.disconnect() }
      else if (!once) setInView(false)
    }, { threshold })
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])
  return [ref, inView]
}

// Apple-style scroll-linked progress (0 = element entering, 1 = element leaving top)
function useScrollProgress() {
  const ref = useRef(null)
  const [p, setP] = useState(0)
  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      raf = requestAnimationFrame(() => {
        const el = ref.current
        if (!el) return
        const r = el.getBoundingClientRect()
        const vh = window.innerHeight
        // 0 when top of el hits bottom of viewport, 1 when bottom of el hits top
        const total = r.height + vh
        const seen = vh - r.top
        setP(Math.max(0, Math.min(1, seen / total)))
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll) }
  }, [])
  return [ref, p]
}

function Reveal({ children, delay = 0, y = 32, blur = true, scale = false, style, ...props }) {
  const [ref, inView] = useInView(0.12)
  return (
    <div ref={ref} style={{
      opacity: inView ? 1 : 0,
      transform: inView ? 'none' : `translateY(${y}px)${scale ? ' scale(0.96)' : ''}`,
      transition: `opacity 0.8s ${EASE} ${delay}s, transform 0.9s ${EASE} ${delay}s`,
      willChange: inView ? 'auto' : 'opacity, transform',
      ...style,
    }} {...props}>
      {children}
    </div>
  )
}

// Gentle parallax drift as element passes through viewport (disabled on mobile)
function Parallax({ children, speed = 30, style, className }) {
  const ref = useRef(null)
  const [off, setOff] = useState(0)
  useEffect(() => {
    if (window.innerWidth < 768) return
    let raf = 0
    const onScroll = () => {
      raf = requestAnimationFrame(() => {
        const el = ref.current
        if (!el) return
        const r = el.getBoundingClientRect()
        const center = r.top + r.height / 2
        const fromMid = (center - window.innerHeight / 2) / window.innerHeight
        setOff(-fromMid * speed)
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', onScroll) }
  }, [speed])
  return <div ref={ref} className={className} style={{ ...style, transform: `translateY(${off}px)`, willChange: 'transform' }}>{children}</div>
}

// Stagger children one-by-one as the container scrolls in
function Stagger({ children, step = 0.08, y = 28, style, className }) {
  const [ref, inView] = useInView(0.12)
  const arr = Array.isArray(children) ? children : [children]
  return (
    <div ref={ref} style={style} className={className}>
      {arr.map((child, i) => (
        <div key={i} style={{
          opacity: inView ? 1 : 0,
          transform: inView ? 'none' : `translateY(${y}px) scale(0.97)`,
          transition: `opacity 0.8s ${EASE} ${i * step}s, transform 0.9s ${EASE} ${i * step}s`,
          willChange: inView ? 'auto' : 'opacity, transform',
        }}>{child}</div>
      ))}
    </div>
  )
}

function Spinner() {
  return <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
}

// Count-up that fires when scrolled into view (prefix/suffix for "< 60s", "8,400+")
function CountUp({ to, prefix = '', suffix = '', dur = 1600, style }) {
  const [ref, inView] = useInView(0.4)
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!inView) return
    let raf = 0, start = 0
    const tick = (ts) => {
      if (!start) start = ts
      const t = Math.min(1, (ts - start) / dur)
      const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic
      setVal(Math.round(to * eased))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [inView, to, dur])
  return <span ref={ref} style={style}>{prefix}{val.toLocaleString()}{suffix}</span>
}

function GradientText({ children, style }) {
  return <span style={{ background: T.grad, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', ...style }}>{children}</span>
}

function GradBtn({ children, onClick, style, ...props }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? T.gradHover : T.grad,
        color: '#fff', border: 'none', borderRadius: 10,
        fontFamily: T.mono, fontSize: 13, fontWeight: 700,
        padding: '14px 28px', cursor: 'pointer',
        boxShadow: hov ? '0 8px 40px rgba(124,58,237,0.5), 0 2px 12px rgba(37,99,235,0.3)' : '0 4px 24px rgba(124,58,237,0.35)',
        transform: hov ? 'translateY(-2px) scale(1.02)' : 'none',
        transition: 'all 0.2s cubic-bezier(0.16,1,0.3,1)',
        letterSpacing: 0.4, ...style,
      }} {...props}
    >{children}</button>
  )
}

// ─── Ticker strip ─────────────────────────────────────────────────────────────
const TICKER_SYMS = ['AAPL','NVDA','MSFT','GOOGL','META','AMZN','TSLA','JPM','NFLX','AMD']
function TickerStrip() {
  const [quotes, setQuotes] = useState([])
  useEffect(() => {
    fetch(`/api/quotes?tickers=${TICKER_SYMS.join(',')}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.quotes?.length) setQuotes(d.quotes) })
      .catch(() => {})
  }, [])

  // Only render once we have data — avoids a flash of empty strip
  if (quotes.length === 0) return null
  const items = [...quotes, ...quotes, ...quotes]
  return (
    <div style={{ overflow: 'hidden', padding: '12px 0', borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}`, background: 'rgba(255,255,255,0.02)', WebkitMaskImage: 'linear-gradient(90deg,transparent,black 6%,black 94%,transparent)', maskImage: 'linear-gradient(90deg,transparent,black 6%,black 94%,transparent)' }}>
      <div style={{ display: 'flex', animation: 'ticker 50s linear infinite', width: 'max-content' }}>
        {items.map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 28px', whiteSpace: 'nowrap', borderRight: `1px solid ${T.border}` }}>
            <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: 1 }}>{t.sym}</span>
            {t.price != null && <span style={{ fontFamily: T.mono, fontSize: 11, color: T.text3 }}>${t.price.toFixed(2)}</span>}
            {t.chg != null && <span style={{ fontFamily: T.mono, fontSize: 10, color: t.chg >= 0 ? T.green : T.red, fontWeight: 700 }}>{t.chg >= 0 ? '▲' : '▼'} {Math.abs(t.chg).toFixed(2)}%</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Report Mockup ────────────────────────────────────────────────────────────
function ReportMockup() {
  const sp = [142,148,145,152,158,155,161,168,165,172,178,181]
  const min = Math.min(...sp), max = Math.max(...sp), range = max-min||1
  const pts = sp.map((v,i)=>`${(i/(sp.length-1))*280},${48-((v-min)/range)*44}`).join(' ')
  return (
    <div style={{ background: 'rgba(12,12,26,0.72)', backdropFilter: 'blur(10px)', border: `1px solid ${T.border2}`, borderRadius: 20, overflow: 'hidden', boxShadow: '0 80px 160px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05), 0 0 100px rgba(124,58,237,0.12)', fontFamily: T.mono }}>
      {/* Window chrome */}
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }} />
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e' }} />
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840' }} />
        </div>
        <span style={{ fontSize: 10, color: T.text3, letterSpacing: 0.5 }}>axiom — NVDA report <span style={{ opacity:0.5 }}>(illustrative)</span></span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 4, padding: '3px 9px' }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: T.green, boxShadow: `0 0 8px ${T.green}` }} />
          <span style={{ fontSize: 9, color: T.green, fontWeight: 700, letterSpacing: 1.2 }}>BUY</span>
        </div>
      </div>
      {/* Header */}
      <div style={{ padding: '20px 22px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: T.text, letterSpacing: -0.5, marginBottom: 4 }}>NVDA</div>
          <div style={{ fontSize: 10, color: T.text3 }}>NVIDIA Corporation · FY 2024 · Generated in 47s</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 20, fontWeight: 700, background: T.grad, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>$980</div>
          <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>+11.9% target upside</div>
        </div>
      </div>
      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', borderBottom: `1px solid ${T.border}` }}>
        {[{ l:'Revenue', v:'$60.9B', s:'+122%', c:T.green },{ l:'EBITDA Mgn', v:'62.1%', s:'+18pp', c:T.green },{ l:'Free CF', v:'$27.0B', s:'44.3% mgn', c:T.cyan },{ l:'P/E Ratio', v:'34.2x', s:'vs 28.1x peers', c:T.gold }].map((m,i)=>(
          <div key={i} style={{ padding:'12px 14px', borderRight: i<3?`1px solid ${T.border}`:'none' }}>
            <div style={{ fontSize: 8, color: T.text3, textTransform:'uppercase', letterSpacing:0.8, marginBottom:5 }}>{m.l}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{m.v}</div>
            <div style={{ fontSize: 9, color: m.c, marginTop:3, fontWeight:600 }}>{m.s}</div>
          </div>
        ))}
      </div>
      {/* DCF + chart */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1.2fr', borderBottom:`1px solid ${T.border}` }}>
        <div style={{ padding:'14px 16px', borderRight:`1px solid ${T.border}` }}>
          <div style={{ fontSize:9, color:T.violet, textTransform:'uppercase', letterSpacing:1.5, marginBottom:10 }}>DCF Model</div>
          {[['WACC','9.2%'],['Terminal Grw.','2.5%'],['Bear (P10)','$840'],['Intrinsic','$946'],['Bull (P90)','$1,140']].map(([k,v])=>(
            <div key={k} style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
              <span style={{ fontSize:9, color:T.text3 }}>{k}</span>
              <span style={{ fontSize:9, color:T.text, fontWeight:600 }}>{v}</span>
            </div>
          ))}
          <div style={{ marginTop:10, height:3, background:'rgba(255,255,255,0.06)', borderRadius:2 }}>
            <div style={{ width:'72%', height:'100%', background:T.grad, borderRadius:2 }} />
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', marginTop:3 }}>
            <span style={{ fontSize:7, color:T.text3 }}>P10</span>
            <span style={{ fontSize:7, color:T.text3 }}>P90</span>
          </div>
        </div>
        <div style={{ padding:'14px 16px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <span style={{ fontSize:9, color:T.text3, textTransform:'uppercase', letterSpacing:0.8 }}>Revenue Trend</span>
            <span style={{ fontSize:10, color:T.green, fontWeight:700 }}>+122% YoY</span>
          </div>
          <svg width="100%" height="48" viewBox="0 0 280 48" preserveAspectRatio="none" style={{ display:'block' }}>
            <defs>
              <linearGradient id="chartGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={T.violet} />
                <stop offset="50%" stopColor={T.blue} />
                <stop offset="100%" stopColor={T.cyan} />
              </linearGradient>
              <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={T.violet} stopOpacity="0.2" />
                <stop offset="100%" stopColor={T.violet} stopOpacity="0" />
              </linearGradient>
            </defs>
            <polygon points={`0,48 ${pts} 280,48`} fill="url(#chartFill)" />
            <polyline points={pts} fill="none" stroke="url(#chartGrad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div style={{ marginTop:12 }}>
            <div style={{ fontSize:9, color:T.text3, textTransform:'uppercase', letterSpacing:0.8, marginBottom:7 }}>Key Risks</div>
            {[['Competitive moat',T.red],['Export controls',T.gold],['Supply chain',T.text3]].map(([r,c])=>(
              <div key={r} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
                <div style={{ width:5, height:5, borderRadius:'50%', background:c, flexShrink:0 }} />
                <span style={{ fontSize:9, color:T.text3 }}>{r}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ padding:'12px 16px' }}>
        <div style={{ fontSize:9, color:T.violet, textTransform:'uppercase', letterSpacing:1.5, marginBottom:6 }}>Analyst Note</div>
        <div style={{ fontSize:11, color:T.text2, lineHeight:1.7, fontStyle:'italic', fontFamily:T.sans }}>"Data center delivered 217% growth to $47.5B. At 34.2x forward P/E against 62% EBITDA margins, premium is justified. Initiating at <strong style={{color:T.green}}>BUY</strong> with $980 target."</div>
      </div>
    </div>
  )
}

// ─── Nav ─────────────────────────────────────────────────────────────────────
function Nav({ navigate }) {
  const { isSignedIn } = useUser()
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 30)
    window.addEventListener('scroll', fn)
    return () => window.removeEventListener('scroll', fn)
  }, [])
  return (
    <nav style={{ position:'fixed', top:0, left:0, right:0, zIndex:200, height:60, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 40px', background: scrolled ? 'rgba(4,4,10,0.85)' : 'transparent', backdropFilter: scrolled ? 'blur(24px) saturate(150%)' : 'none', borderBottom: scrolled ? `1px solid ${T.border}` : '1px solid transparent', transition:'all 0.3s ease' }}>
      <div style={{ display:'flex', alignItems:'center', gap:40 }}>
        <div style={{ fontFamily:T.mono, fontSize:15, fontWeight:700, letterSpacing:6, background:T.grad, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text', cursor:'pointer' }}>AXIOM</div>
        <div className="nav-links" style={{ display:'flex', gap:28 }}>
          {['Features','Pricing','FAQ'].map(item=>(
            <a key={item} href={`#${item.toLowerCase()}`} style={{ fontFamily:T.sans, fontSize:13, color:T.text3, textDecoration:'none', transition:'color 0.15s' }} onMouseEnter={e=>e.target.style.color='#fff'} onMouseLeave={e=>e.target.style.color=T.text3}>{item}</a>
          ))}
        </div>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        {clerkEnabled && !isSignedIn && (
          <>
            <SignInButton mode="modal"><button style={{ fontFamily:T.sans, fontSize:13, color:T.text2, background:'transparent', border:'none', cursor:'pointer', padding:'6px 12px' }} onMouseEnter={e=>e.target.style.color='#fff'} onMouseLeave={e=>e.target.style.color=T.text2}>Sign in</button></SignInButton>
            <SignUpButton mode="modal">
              <button style={{ fontFamily:T.sans, fontSize:13, fontWeight:600, color:'#fff', background:T.grad, border:'none', borderRadius:8, padding:'8px 20px', cursor:'pointer', boxShadow:'0 4px 20px rgba(124,58,237,0.4)', transition:'all 0.2s' }} onMouseEnter={e=>{e.target.style.boxShadow='0 6px 28px rgba(124,58,237,0.6)';e.target.style.transform='translateY(-1px)'}} onMouseLeave={e=>{e.target.style.boxShadow='0 4px 20px rgba(124,58,237,0.4)';e.target.style.transform='none'}}>Create free account</button>
            </SignUpButton>
          </>
        )}
        {clerkEnabled && isSignedIn && (
          <>
            <button onClick={()=>navigate('/account')} className="nav-links" style={{ fontFamily:T.sans, fontSize:13, color:T.text2, background:'transparent', border:'none', cursor:'pointer', padding:'6px 12px' }} onMouseEnter={e=>e.target.style.color='#fff'} onMouseLeave={e=>e.target.style.color=T.text2}>Account</button>
            <button onClick={()=>navigate('/app')} style={{ fontFamily:T.sans, fontSize:13, fontWeight:600, color:'#fff', background:T.grad, border:'none', borderRadius:8, padding:'8px 20px', cursor:'pointer', boxShadow:'0 4px 20px rgba(124,58,237,0.4)', transition:'all 0.2s' }} onMouseEnter={e=>{e.target.style.boxShadow='0 6px 28px rgba(124,58,237,0.6)';e.target.style.transform='translateY(-1px)'}} onMouseLeave={e=>{e.target.style.boxShadow='0 4px 20px rgba(124,58,237,0.4)';e.target.style.transform='none'}}>Open AXIOM →</button>
            <UserButton afterSignOutUrl="/" />
          </>
        )}
      </div>
    </nav>
  )
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
function Hero({ navigate, runDemo, ticker, setTicker, loading, progress, progressPct, error }) {
  const inputRef = useRef(null)
  const { isSignedIn } = useUser()
  const [focused, setFocused] = useState(false)
  const [heroP, setHeroP] = useState(0)
  useEffect(() => {
    let raf = 0
    const onScroll = () => { raf = requestAnimationFrame(() => setHeroP(Math.min(1, window.scrollY / window.innerHeight))) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', onScroll) }
  }, [])
  const POPULAR = ['AAPL','MSFT','NVDA','GOOGL','META','TSLA']

  function handleGenerate(t) {
    if (!t?.trim()) return
    const sym = t.trim().toUpperCase()
    if (isSignedIn) navigate(`/app?q=${sym}`)
    else runDemo(sym)
  }

  return (
    <section style={{ minHeight:'100vh', position:'relative', overflow:'hidden', display:'flex', alignItems:'center', paddingTop:80 }}>
      {/* Gradient orbs */}
      <div style={{ position:'absolute', top:'-10%', left:'-8%', width:700, height:700, borderRadius:'50%', background:'radial-gradient(circle, rgba(124,58,237,0.13) 0%, transparent 65%)', animation:'orbFloat 12s ease-in-out infinite', zIndex:0, pointerEvents:'none' }} />
      <div style={{ position:'absolute', bottom:'-15%', right:'-5%', width:600, height:600, borderRadius:'50%', background:'radial-gradient(circle, rgba(37,99,235,0.1) 0%, transparent 65%)', animation:'orbFloat 16s ease-in-out infinite reverse', zIndex:0, pointerEvents:'none' }} />
      {/* Grid overlay */}
      <div style={{ position:'absolute', inset:0, backgroundImage:`linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)`, backgroundSize:'64px 64px', zIndex:0 }} />
      {/* Bottom fade */}
      <div style={{ position:'absolute', bottom:0, left:0, right:0, height:160, background:`linear-gradient(to bottom, transparent, ${T.bg})`, zIndex:2, pointerEvents:'none' }} />

      {/* Full-bleed background photo */}
      <div style={{ position:'absolute', inset:0, zIndex:1 }}>
        <img src="https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1600&h=900&fit=crop&q=80" alt="" style={{ width:'100%', height:'100%', objectFit:'cover', opacity:0.07 }} />
        <div style={{ position:'absolute', inset:0, background:'linear-gradient(135deg, rgba(4,4,10,0.95) 0%, rgba(4,4,10,0.7) 50%, rgba(4,4,10,0.85) 100%)' }} />
      </div>

      {/* 2-column layout */}
      <div className="hero-grid" style={{ position:'relative', zIndex:3, maxWidth:1160, width:'100%', margin:'0 auto', padding:'48px 40px 80px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:56, alignItems:'center' }}>

        {/* ── Left: copy + input ── */}
        <div style={{ animation:'fadeUp 0.55s ease both' }}>
          {/* Live badge */}
          <div style={{ display:'inline-flex', alignItems:'center', gap:7, background:'rgba(124,58,237,0.1)', border:'1px solid rgba(124,58,237,0.28)', borderRadius:99, padding:'5px 14px', marginBottom:24 }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:T.green, boxShadow:`0 0 8px ${T.green}` }} />
            <span style={{ fontFamily:T.mono, fontSize:10, color:'rgba(255,255,255,0.45)', letterSpacing:1.5 }}>LIVE · SEC EDGAR · 8,400+ US STOCKS</span>
          </div>

          {/* Headline */}
          <h1 style={{ fontFamily:T.sans, fontSize:'clamp(36px,3.8vw,64px)', fontWeight:900, letterSpacing:'-0.04em', lineHeight:1.05, margin:'0 0 20px', color:T.text }}>
            Know if a stock is<br />
            <GradientText>a Buy or a Sell</GradientText><br />
            in 60 seconds.
          </h1>

          {/* Subtext */}
          <p style={{ fontFamily:T.sans, fontSize:15, color:T.text2, lineHeight:1.8, margin:'0 0 32px', maxWidth:448 }}>
            AXIOM turns live SEC filings into a full Wall-Street-grade research report — DCF valuation, Monte Carlo, comps, risk matrix, and a clear <strong style={{ color:T.text, fontWeight:600 }}>BUY / HOLD / SELL</strong>. No spreadsheets. No signup to try.
          </p>

          {/* Search bar */}
          <form onSubmit={e=>{e.preventDefault();handleGenerate(ticker)}} style={{ marginBottom:12 }}>
            <div style={{ display:'flex', background:'rgba(255,255,255,0.05)', border:`1.5px solid ${focused?'rgba(124,58,237,0.7)':T.border2}`, borderRadius:12, overflow:'hidden', backdropFilter:'blur(16px)', boxShadow: focused ? '0 0 0 3px rgba(124,58,237,0.12)' : 'none', transition:'border-color 0.2s, box-shadow 0.2s' }}>
              <span style={{ display:'flex', alignItems:'center', padding:'0 16px', fontFamily:T.mono, fontSize:15, color:T.text3, borderRight:`1px solid rgba(255,255,255,0.07)`, flexShrink:0 }}>$</span>
              <input ref={inputRef} type="text" placeholder="Ticker symbol — AAPL, NVDA, MSFT..." value={ticker} onChange={e=>setTicker(e.target.value.toUpperCase().replace(/[^A-Z.]/g,''))} disabled={loading} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
                style={{ flex:1, background:'transparent', border:'none', padding:'15px 14px', color:T.text, fontFamily:T.mono, fontSize:13, outline:'none', minWidth:0 }} />
              <button type="submit" disabled={loading||!ticker.trim()} style={{ flexShrink:0, background: loading||!ticker.trim() ? 'transparent' : T.grad, color: loading||!ticker.trim() ? T.text3 : '#fff', border:'none', borderLeft:`1px solid rgba(255,255,255,0.07)`, padding:'0 20px', fontFamily:T.mono, fontSize:11, fontWeight:700, cursor: loading||!ticker.trim() ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', gap:7, transition:'all 0.15s', whiteSpace:'nowrap', letterSpacing:0.5 }}>
                {loading ? <><Spinner />Running...</> : isSignedIn ? 'Analyze →' : 'Run free →'}
              </button>
            </div>
          </form>

          {/* Progress */}
          {loading && (
            <div style={{ marginBottom:12 }}>
              <div style={{ height:2, background:'rgba(255,255,255,0.06)', borderRadius:1, overflow:'hidden', marginBottom:6 }}>
                <div style={{ height:'100%', background:T.grad, width:progressPct+'%', transition:'width 0.5s ease' }} />
              </div>
              <span style={{ fontFamily:T.mono, fontSize:11, color:T.violet, animation:'pulse 1.5s infinite' }}>{progress}</span>
            </div>
          )}
          {error && !error.includes('limit') && (
            <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, padding:'9px 13px', fontFamily:T.mono, fontSize:11, color:T.red, marginBottom:12 }}>⚠ {error}</div>
          )}

          {/* Quick picks */}
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center', marginBottom:16 }}>
            <span style={{ fontFamily:T.mono, fontSize:10, color:T.text3, flexShrink:0 }}>Try:</span>
            {POPULAR.map(t=>(
              <button key={t} onClick={()=>{setTicker(t);handleGenerate(t)}} style={{ fontFamily:T.mono, fontSize:10, color:T.text3, background:'rgba(255,255,255,0.04)', border:`1px solid rgba(255,255,255,0.08)`, borderRadius:6, padding:'4px 10px', cursor:'pointer', transition:'all 0.15s' }} onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(124,58,237,0.45)';e.currentTarget.style.color='rgba(167,139,250,1)'}} onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(255,255,255,0.08)';e.currentTarget.style.color=T.text3}}>{t}</button>
            ))}
          </div>

          {/* Trust row */}
          <div style={{ display:'flex', gap:18, flexWrap:'wrap' }}>
            {['Free to try — no signup','No credit card','Real SEC filings'].map(t=>(
              <span key={t} style={{ fontFamily:T.mono, fontSize:10, color:T.text3, display:'flex', alignItems:'center', gap:5 }}>
                <span style={{ color:T.green, fontSize:11 }}>✓</span>{t}
              </span>
            ))}
          </div>
          {/* Zero-friction sample path */}
          {!loading && (
            <div style={{ marginTop:10 }}>
              <button onClick={()=>handleGenerate('AAPL')} style={{ background:'none', border:'none', cursor:'pointer', fontFamily:T.mono, fontSize:10, color:T.text3, textDecoration:'underline', textDecorationColor:'rgba(255,255,255,0.18)', textUnderlineOffset:3, padding:0, transition:'color 0.15s' }} onMouseEnter={e=>e.target.style.color='rgba(167,139,250,0.85)'} onMouseLeave={e=>e.target.style.color=T.text3}>or see a live AAPL report →</button>
            </div>
          )}
        </div>

        {/* ── Right: mockup with parallax ── */}
        <div className="hero-mockup" style={{ animation:'fadeUp 0.65s ease 0.18s both', minWidth:0, transform:`translateY(${heroP * -60}px)`, willChange:'transform' }}>
          <ReportMockup />
        </div>
      </div>
    </section>
  )
}

// ─── Social proof bar ─────────────────────────────────────────────────────────
function SocialProof() {
  return (
    <Reveal style={{ padding:'56px 24px', borderTop:`1px solid ${T.border}`, borderBottom:`1px solid ${T.border}`, textAlign:'center' }}>
      <div style={{ maxWidth:900, margin:'0 auto' }}>
        <div style={{ fontFamily:T.mono, fontSize:9, color:T.text3, letterSpacing:2.5, textTransform:'uppercase', marginBottom:10 }}>No black box — every number is traceable to its source</div>
        <div style={{ fontFamily:T.sans, fontSize:13, color:T.text2, marginBottom:28, maxWidth:520, margin:'0 auto 28px', lineHeight:1.6 }}>AXIOM doesn't make up numbers. It pulls official SEC filings and shows its work — the same primary data professional analysts use.</div>
        <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:0, flexWrap:'wrap' }}>
          {[
            { name:'SEC EDGAR', desc:'Official XBRL filings' },
            { name:'NYSE', desc:'5,000+ equities' },
            { name:'NASDAQ', desc:'3,400+ equities' },
            { name:'Groq', desc:'LLaMA 3.3 70B' },
            { name:'Neon', desc:'Serverless Postgres' },
            { name:'Vercel', desc:'Edge infrastructure' },
          ].map(({ name, desc }, i, arr) => (
            <div key={name} style={{ padding:'0 28px', borderRight: i<arr.length-1 ? `1px solid ${T.border}` : 'none', textAlign:'center' }}>
              <div style={{ fontFamily:T.mono, fontSize:12, fontWeight:700, color:'rgba(255,255,255,0.35)', letterSpacing:1.5, marginBottom:4 }}>{name}</div>
              <div style={{ fontFamily:T.mono, fontSize:9, color:T.text3 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </Reveal>
  )
}

// ─── Stats ────────────────────────────────────────────────────────────────────
function Stats() {
  const items = [
    { node: <CountUp to={8400} suffix="+" />, label:'US stocks covered', sub:'All SEC EDGAR filers' },
    { node: <CountUp to={60} prefix="< " suffix="s" />, label:'Average report time', sub:'From ticker to full note' },
    { node: <CountUp to={2000} />, label:'Monte Carlo trials', sub:'Per DCF valuation' },
    { node: 'Free', label:'To get started', sub:'No card, no keys' },
  ]
  return (
    <Reveal style={{ padding:'80px 24px', background:'rgba(255,255,255,0.01)' }}>
      <div style={{ maxWidth:960, margin:'0 auto', display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'32px 0' }} className="stats-grid">
        {items.map((s,i)=>(
          <div key={i} className="stat-cell" style={{ padding:'0 32px', textAlign:'center', borderRight: i<3?`1px solid ${T.border}`:'none' }}>
            <div style={{ fontFamily:T.mono, fontSize:'clamp(30px,4vw,40px)', fontWeight:800, background:T.grad, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text', marginBottom:8, letterSpacing:-1 }}>{s.node}</div>
            <div style={{ fontFamily:T.sans, fontSize:14, fontWeight:600, color:T.text, marginBottom:4 }}>{s.label}</div>
            <div style={{ fontFamily:T.mono, fontSize:10, color:T.text3 }}>{s.sub}</div>
          </div>
        ))}
      </div>
    </Reveal>
  )
}

// ─── Features Bento ───────────────────────────────────────────────────────────
function Features() {
  return (
    <section id="features" style={{ padding:'120px 24px', borderTop:`1px solid ${T.border}` }}>
      <div style={{ maxWidth:1040, margin:'0 auto' }}>
        <Reveal style={{ textAlign:'center', marginBottom:64 }}>
          <div style={{ fontFamily:T.mono, fontSize:10, letterSpacing:2, textTransform:'uppercase', marginBottom:12, background:T.grad, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>What AXIOM produces</div>
          <h2 style={{ fontFamily:T.sans, fontSize:'clamp(32px,5vw,60px)', fontWeight:900, color:T.text, letterSpacing:'-0.04em', margin:'0 0 16px', lineHeight:1 }}>Six analyses.<br />One report.</h2>
          <p style={{ fontFamily:T.sans, fontSize:15, color:T.text2, maxWidth:460, margin:'0 auto', lineHeight:1.75 }}>Everything an institutional analyst builds over hours — in one structured output.</p>
        </Reveal>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gridAutoRows:'auto', gap:10 }} className="bento-grid">
          {/* Big card — DCF */}
          <Reveal delay={0} style={{ gridColumn:'span 4', background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}`, borderRadius:20, padding:'40px 44px', position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', top:-60, right:-60, width:300, height:300, borderRadius:'50%', background:'radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 70%)', pointerEvents:'none' }} />
            <div style={{ fontFamily:T.mono, fontSize:9, color:T.violet, letterSpacing:2, textTransform:'uppercase', marginBottom:14 }}>01 — Valuation Engine</div>
            <h3 style={{ fontFamily:T.sans, fontSize:28, fontWeight:800, color:T.text, margin:'0 0 12px', letterSpacing:'-0.03em' }}>DCF + Monte Carlo</h3>
            <p style={{ fontSize:14, color:T.text2, lineHeight:1.75, maxWidth:400, marginBottom:28 }}>8-year two-stage discounted cash flow with 2,000 Monte Carlo iterations. Full P10–P90 distribution, not just a single price target.</p>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {['WACC sensitivity','Terminal growth','Bear/base/bull','Probability dist.'].map(t=>(
                <span key={t} style={{ fontFamily:T.mono, fontSize:9, color:T.text3, background:'rgba(124,58,237,0.08)', border:'1px solid rgba(124,58,237,0.2)', borderRadius:4, padding:'3px 8px' }}>{t}</span>
              ))}
            </div>
          </Reveal>

          {/* Altman Z */}
          <Reveal delay={0.05} style={{ gridColumn:'span 2', background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}`, borderRadius:20, padding:'32px 28px', position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', bottom:-30, right:-30, width:120, height:120, borderRadius:'50%', background:'radial-gradient(circle, rgba(239,68,68,0.12) 0%, transparent 70%)' }} />
            <div style={{ fontFamily:T.mono, fontSize:9, color:'rgba(239,68,68,0.8)', letterSpacing:2, textTransform:'uppercase', marginBottom:14 }}>02 — Risk Score</div>
            <h3 style={{ fontFamily:T.sans, fontSize:22, fontWeight:800, color:T.text, margin:'0 0 10px' }}>Altman Z-Score</h3>
            <p style={{ fontSize:12, color:T.text2, lineHeight:1.7, marginBottom:20 }}>Five-factor bankruptcy prediction. Flags financial distress before you read a word.</p>
            <div style={{ display:'flex', gap:6 }}>
              {[['Safe',T.green],['Grey',T.gold],['Distress',T.red]].map(([z,c])=>(
                <div key={z} style={{ flex:1, padding:'8px 4px', background:`${c}12`, border:`1px solid ${c}30`, borderRadius:6, textAlign:'center' }}>
                  <div style={{ fontFamily:T.mono, fontSize:8, color:c, fontWeight:700 }}>{z}</div>
                </div>
              ))}
            </div>
          </Reveal>

          {/* SEC Data card with image */}
          <Reveal delay={0.08} style={{ gridColumn:'span 2', borderRadius:20, overflow:'hidden', position:'relative', minHeight:220 }}>
            <img src="https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=600&h=400&fit=crop&q=80" alt="Financial data" loading="lazy" className="kenburns" style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', opacity:0.25 }} />
            <div style={{ position:'absolute', inset:0, background:'linear-gradient(135deg, rgba(6,182,212,0.3), rgba(37,99,235,0.2))', backdropFilter:'blur(2px)' }} />
            <div style={{ position:'relative', padding:'28px 24px' }}>
              <div style={{ fontFamily:T.mono, fontSize:9, color:T.cyan, letterSpacing:2, textTransform:'uppercase', marginBottom:14 }}>03 — Data</div>
              <h3 style={{ fontFamily:T.sans, fontSize:22, fontWeight:800, color:T.text, margin:'0 0 10px' }}>Live SEC EDGAR</h3>
              <p style={{ fontSize:12, color:'rgba(255,255,255,0.7)', lineHeight:1.7 }}>Official XBRL filings from the SEC. 10-K, 10-Q, real-time price data.</p>
            </div>
          </Reveal>

          {/* Comps */}
          <Reveal delay={0.10} style={{ gridColumn:'span 2', background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}`, borderRadius:20, padding:'32px 28px' }}>
            <div style={{ fontFamily:T.mono, fontSize:9, color:T.blue, letterSpacing:2, textTransform:'uppercase', marginBottom:14 }}>04 — Benchmarking</div>
            <h3 style={{ fontFamily:T.sans, fontSize:22, fontWeight:800, color:T.text, margin:'0 0 10px' }}>Comps Table</h3>
            <p style={{ fontSize:12, color:T.text2, lineHeight:1.7 }}>Comparable company analysis — EV/EBITDA, P/E, revenue growth, margins across 3 sector peers.</p>
            <div style={{ marginTop:16, display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:4 }}>
              {['EV/EBITDA','P/E Ratio','Rev Growth','Gross Mgn','Net Mgn','FCF Yield'].map(m=>(
                <div key={m} style={{ fontFamily:T.mono, fontSize:8, color:T.text3, background:'rgba(255,255,255,0.04)', borderRadius:4, padding:'4px 6px', textAlign:'center' }}>{m}</div>
              ))}
            </div>
          </Reveal>

          {/* Piotroski */}
          <Reveal delay={0.12} style={{ gridColumn:'span 2', background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}`, borderRadius:20, padding:'32px 28px' }}>
            <div style={{ fontFamily:T.mono, fontSize:9, color:T.violet, letterSpacing:2, textTransform:'uppercase', marginBottom:14 }}>05 — Quality</div>
            <h3 style={{ fontFamily:T.sans, fontSize:22, fontWeight:800, color:T.text, margin:'0 0 10px' }}>Piotroski F-Score</h3>
            <p style={{ fontSize:12, color:T.text2, lineHeight:1.7 }}>9-point quality screen across profitability, leverage, and efficiency.</p>
            <div style={{ display:'flex', gap:4, marginTop:16 }}>
              {Array.from({length:9},(_,i)=>(
                <div key={i} style={{ flex:1, height:24, background: i<7 ? T.grad : 'rgba(255,255,255,0.06)', borderRadius:4 }} />
              ))}
            </div>
            <div style={{ fontFamily:T.mono, fontSize:9, color:T.green, marginTop:6 }}>7/9 — Strong fundamental quality</div>
          </Reveal>

          {/* Recommendation image card */}
          <Reveal delay={0.14} style={{ gridColumn:'span 2', borderRadius:20, overflow:'hidden', position:'relative', minHeight:200 }}>
            <img src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&h=400&fit=crop&q=80" alt="Analytics dashboard" loading="lazy" className="kenburns kenburns-alt" style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', opacity:0.2 }} />
            <div style={{ position:'absolute', inset:0, background:'linear-gradient(135deg, rgba(16,185,129,0.3), rgba(6,182,212,0.15))' }} />
            <div style={{ position:'relative', padding:'28px 24px' }}>
              <div style={{ fontFamily:T.mono, fontSize:9, color:T.green, letterSpacing:2, textTransform:'uppercase', marginBottom:14 }}>06 — Output</div>
              <h3 style={{ fontFamily:T.sans, fontSize:22, fontWeight:800, color:T.text, margin:'0 0 10px' }}>BUY/HOLD/SELL</h3>
              <p style={{ fontSize:12, color:'rgba(255,255,255,0.7)', lineHeight:1.7 }}>Clear recommendation, 12-month price target, and upside % — grounded in the model.</p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

// ─── Who it's for ─────────────────────────────────────────────────────────────
function ForSection() {
  const cards = [
    { img:'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=300&fit=crop&q=80', role:'Retail Investors', desc:'Stop reading Reddit for stock picks. Get the same analysis a buy-side analyst runs — in 60 seconds.' },
    { img:'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&h=300&fit=crop&q=80', role:'Finance Students', desc:'Learn what a real equity research note looks like. Use AXIOM reports as reference for DCF modeling and investment memos.' },
    { img:'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400&h=300&fit=crop&q=80', role:'Analysts & Associates', desc:'Run a fast first-pass on any company before spending hours in a model. Validate your assumptions against a second opinion.' },
    { img:'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400&h=300&fit=crop&q=80', role:'Finance Creators', desc:'Power your newsletter, podcast, or YouTube with data-backed analysis. Generate a credible research note before you record.' },
  ]
  return (
    <section style={{ padding:'120px 24px', borderTop:`1px solid ${T.border}`, background:'rgba(255,255,255,0.01)' }}>
      <div style={{ maxWidth:1000, margin:'0 auto' }}>
        <Reveal style={{ textAlign:'center', marginBottom:64 }}>
          <div style={{ fontFamily:T.mono, fontSize:10, letterSpacing:2, textTransform:'uppercase', marginBottom:12, background:T.grad, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>Who uses AXIOM</div>
          <h2 style={{ fontFamily:T.sans, fontSize:'clamp(28px,5vw,52px)', fontWeight:900, color:T.text, letterSpacing:'-0.04em', margin:0, lineHeight:1 }}>Built for anyone who takes<br />stocks seriously.</h2>
        </Reveal>
        <Stagger step={0.1} style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }} className="usecases-grid">
          {cards.map((c,i)=>(
            <div key={i} className="lift-card" style={{ background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}`, borderRadius:18, overflow:'hidden', transition:`all 0.4s ${EASE}` }}>
              <div style={{ height:170, overflow:'hidden', position:'relative' }}>
                <img src={c.img} alt={c.role} loading="lazy" className="lift-img" style={{ width:'100%', height:'100%', objectFit:'cover', transition:`transform 0.6s ${EASE}` }} />
                <div style={{ position:'absolute', inset:0, background:'linear-gradient(to bottom, transparent 35%, rgba(4,4,10,0.92))' }} />
                <div style={{ position:'absolute', bottom:14, left:18, fontFamily:T.sans, fontSize:15, fontWeight:700, color:'#fff' }}>{c.role}</div>
              </div>
              <div style={{ padding:'18px 20px 22px' }}>
                <div style={{ fontSize:12, color:T.text2, lineHeight:1.75 }}>{c.desc}</div>
              </div>
            </div>
          ))}
        </Stagger>
      </div>
    </section>
  )
}

// ─── Apple-style scroll-scrub showcase ────────────────────────────────────────
function Showcase() {
  const [ref, p] = useScrollProgress()
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  // p: 0 (entering) → 1 (leaving). Use 0.1–0.6 window for the scrub.
  const t = Math.max(0, Math.min(1, (p - 0.1) / 0.45))
  const startScale = isMobile ? 0.9 : 0.82
  const scale = startScale + t * (1 - startScale)   // → 1.0
  const opacity = 0.35 + t * 0.65          // dim → bright
  const radius = 32 - t * 18               // rounded → flatter
  const translateY = (1 - t) * 40
  const captionOpacity = Math.max(0, Math.min(1, (p - 0.35) / 0.2))

  return (
    <section ref={ref} style={{ position:'relative', height: isMobile ? '160vh' : '200vh', borderTop:`1px solid ${T.border}` }}>
      <div style={{ position:'sticky', top:0, height:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', overflow:'hidden', padding:'0 16px' }}>
        {/* Ambient glow that intensifies */}
        <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:1000, height:700, borderRadius:'50%', background:`radial-gradient(ellipse, rgba(124,58,237,${0.06 + t*0.14}) 0%, transparent 70%)`, pointerEvents:'none', transition:'background 0.1s linear', maxWidth:'100vw' }} />

        <div style={{ position:'relative', zIndex:2, textAlign:'center', marginBottom:32, opacity: Math.max(0, 1 - t*1.4), transform:`translateY(${-t*30}px)`, pointerEvents:'none' }}>
          <div style={{ fontFamily:T.mono, fontSize:11, letterSpacing:2.5, textTransform:'uppercase', marginBottom:14, background:T.grad, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>The full report</div>
          <h2 style={{ fontFamily:T.sans, fontSize:'clamp(30px,6vw,76px)', fontWeight:900, color:T.text, letterSpacing:'-0.05em', margin:0, lineHeight:0.95 }}>Every number.<br />Beautifully rendered.</h2>
        </div>

        {/* The scaling hero image — static shadow (animating box-shadow blur repaints every frame) */}
        <div style={{ position:'relative', zIndex:1, width:'min(1000px, 94vw)', transform:`scale(${scale}) translateY(${translateY}px)`, opacity, borderRadius:radius, overflow:'hidden', boxShadow:'0 60px 140px rgba(0,0,0,0.7), 0 0 90px rgba(124,58,237,0.18)', border:'1px solid rgba(255,255,255,0.1)', willChange:'transform, opacity' }}>
          <img src="https://images.unsplash.com/photo-1642790106117-e829e14a795f?w=1400&h=820&fit=crop&q=85" alt="Financial dashboard" loading="lazy" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
          <div style={{ position:'absolute', inset:0, background:'linear-gradient(135deg, rgba(124,58,237,0.18), rgba(6,182,212,0.1))' }} />
          {/* Caption overlay reveals near the end */}
          <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:'48px 24px 28px', background:'linear-gradient(to top, rgba(4,4,10,0.92), transparent)', opacity:captionOpacity, transform:`translateY(${(1-captionOpacity)*20}px)`, transition:'opacity 0.1s linear' }}>
            <div style={{ display:'flex', gap:'16px 32px', flexWrap:'wrap', justifyContent:'center' }}>
              {[['DCF + Monte Carlo','2,000 simulations'],['Live SEC EDGAR','Real XBRL data'],['Risk matrix','5-category scoring'],['60-second output','Ready to share']].map(([a,b])=>(
                <div key={a} style={{ textAlign:'center' }}>
                  <div style={{ fontFamily:T.sans, fontSize:'clamp(12px,2.5vw,15px)', fontWeight:700, color:'#fff', marginBottom:4 }}>{a}</div>
                  <div style={{ fontFamily:T.mono, fontSize:9, color:'rgba(255,255,255,0.6)' }}>{b}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── How it works ─────────────────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    { n:'01', title:'Enter any ticker', desc:'Type any US-listed stock symbol. NYSE, NASDAQ, OTC — if it files with the SEC, AXIOM covers it.' },
    { n:'02', title:'Live EDGAR fetch', desc:'AXIOM pulls 10-K and 10-Q XBRL filings from the SEC directly. No cached data, no stale exports.' },
    { n:'03', title:'AI builds the model', desc:'Two-pass analysis: chain-of-thought reasoning, then structured JSON extraction for every section.' },
    { n:'04', title:'Full report in 60s', desc:'DCF model, comps, risk matrix, analyst note — all in one structured research note you can share or export.' },
  ]
  return (
    <section style={{ padding:'120px 24px', borderTop:`1px solid ${T.border}` }}>
      <div style={{ maxWidth:960, margin:'0 auto' }}>
        <Reveal style={{ textAlign:'center', marginBottom:72 }}>
          <div style={{ fontFamily:T.mono, fontSize:10, letterSpacing:2, textTransform:'uppercase', marginBottom:12, background:T.grad, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>Process</div>
          <h2 style={{ fontFamily:T.sans, fontSize:'clamp(28px,5vw,52px)', fontWeight:900, color:T.text, letterSpacing:'-0.04em', margin:0 }}>Four steps. Sixty seconds.</h2>
        </Reveal>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:0 }} className="steps-grid">
          {steps.map((s,i)=>(
            <Reveal key={i} delay={i*0.08} style={{ padding:'0 20px', textAlign:'center', position:'relative' }}>
              {i < 3 && <div className="step-connector" style={{ position:'absolute', top:26, right:'-10%', width:'20%', height:1, background:'linear-gradient(90deg, rgba(124,58,237,0.4), transparent)', zIndex:0 }} />}
              <div style={{ width:52, height:52, borderRadius:'50%', background:'rgba(124,58,237,0.1)', border:'1px solid rgba(124,58,237,0.25)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 18px', boxShadow:'0 0 0 6px rgba(4,4,10,1)' }}>
                <span style={{ fontFamily:T.mono, fontSize:11, fontWeight:700, background:T.grad, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>{s.n}</span>
              </div>
              <div style={{ fontFamily:T.sans, fontSize:15, fontWeight:700, color:T.text, marginBottom:10 }}>{s.title}</div>
              <div style={{ fontSize:12, color:T.text2, lineHeight:1.75 }}>{s.desc}</div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Demo screenshot ──────────────────────────────────────────────────────────
function DemoSection() {
  return (
    <Reveal style={{ padding:'120px 24px', borderTop:`1px solid ${T.border}`, background:'rgba(255,255,255,0.01)' }}>
      <div style={{ maxWidth:1000, margin:'0 auto', display:'grid', gridTemplateColumns:'1fr 1fr', gap:64, alignItems:'center' }} className="demo-grid">
        <div>
          <div style={{ fontFamily:T.mono, fontSize:10, letterSpacing:2, textTransform:'uppercase', marginBottom:12, background:T.grad, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>Real data. Always.</div>
          <h2 style={{ fontFamily:T.sans, fontSize:'clamp(26px,4vw,44px)', fontWeight:900, color:T.text, letterSpacing:'-0.04em', margin:'0 0 18px', lineHeight:1.05 }}>Directly from the SEC.<br />No data vendors.</h2>
          <p style={{ fontSize:14, color:T.text2, lineHeight:1.85, marginBottom:28 }}>Every report pulls from the SEC's EDGAR XBRL database — the same structured data that Bloomberg terminals use. No third-party aggregators, no stale quarterly exports.</p>
          {['Real-time 10-K and 10-Q filings','XBRL structured financial data','Income statement, balance sheet, FCF','Historical revenue and margin trends','Live market price and market cap'].map(f=>(
            <div key={f} style={{ display:'flex', alignItems:'center', gap:12, marginBottom:11 }}>
              <div style={{ width:18, height:18, borderRadius:4, background:'rgba(16,185,129,0.12)', border:'1px solid rgba(16,185,129,0.25)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <span style={{ fontSize:10, color:T.green }}>✓</span>
              </div>
              <span style={{ fontSize:13, color:T.text2 }}>{f}</span>
            </div>
          ))}
        </div>
        <div style={{ background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}`, borderRadius:16, overflow:'hidden', fontFamily:T.mono, fontSize:11 }}>
          <div style={{ background:'rgba(255,255,255,0.03)', padding:'12px 18px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ display:'flex', gap:5 }}>
              <div style={{ width:9, height:9, borderRadius:'50%', background:'rgba(255,95,87,0.5)' }} />
              <div style={{ width:9, height:9, borderRadius:'50%', background:'rgba(254,188,46,0.5)' }} />
              <div style={{ width:9, height:9, borderRadius:'50%', background:'rgba(40,200,64,0.5)' }} />
            </div>
            <span style={{ color:T.text3, fontSize:10, marginLeft:6 }}>SEC EDGAR · XBRL API</span>
          </div>
          <div style={{ padding:'20px 22px', lineHeight:2.1 }}>
            {[
              ['GET','/api/edgar?ticker=NVDA','rgba(251,191,36,0.9)'],
              ['→','Resolving CIK: 0001045810',T.text3],
              ['→','Fetching companyfacts...',T.text3],
              ['✓','us-gaap:Revenues $60.9B',T.green],
              ['✓','OperatingIncomeLoss $32.9B',T.green],
              ['✓','StockholdersEquity $42.9B',T.green],
              ['✓','NetCashProvidedByOperating $28.1B',T.green],
              ['→','Live price: fetched from Yahoo Finance',T.text3],
              ['✓','28 financial fields extracted',T.green],
            ].map(([p,l,c],i)=>(
              <div key={i} style={{ display:'flex', gap:14 }}>
                <span style={{ color:p==='GET'?'rgba(251,191,36,0.9)':p==='✓'?T.green:T.text3, minWidth:20 }}>{p}</span>
                <span style={{ color:c }}>{l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Reveal>
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
      const r = await fetch('/api/waitlist', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ email:waitEmail }) })
      setWaitStatus(r.ok ? 'done' : 'error')
    } catch { setWaitStatus('error') }
  }

  return (
    <section id="pricing" style={{ padding:'120px 24px', borderTop:`1px solid ${T.border}` }}>
      <div style={{ maxWidth:820, margin:'0 auto' }}>
        <Reveal style={{ textAlign:'center', marginBottom:64 }}>
          <div style={{ fontFamily:T.mono, fontSize:10, letterSpacing:2, textTransform:'uppercase', marginBottom:12, background:T.grad, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>Pricing</div>
          <h2 style={{ fontFamily:T.sans, fontSize:'clamp(28px,5vw,56px)', fontWeight:900, color:T.text, letterSpacing:'-0.04em', margin:'0 0 14px', lineHeight:1 }}>Simple pricing.<br />Start free.</h2>
          <p style={{ fontFamily:T.sans, fontSize:15, color:T.text2, margin:0 }}>Full institutional-grade reports, no API keys required.</p>
        </Reveal>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }} className="pricing-grid">
          {/* Free */}
          <Reveal delay={0} style={{ background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}`, borderRadius:22, padding:'44px 40px', transition:'border-color 0.2s, box-shadow 0.2s' }} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.border2;e.currentTarget.style.boxShadow='0 20px 60px rgba(0,0,0,0.3)'}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.boxShadow='none'}}>
            <div style={{ fontFamily:T.mono, fontSize:10, color:T.text3, textTransform:'uppercase', letterSpacing:2, marginBottom:16 }}>Free account</div>
            <div style={{ fontFamily:T.mono, fontSize:60, fontWeight:800, color:T.text, lineHeight:1, marginBottom:6 }}>$0</div>
            <div style={{ fontSize:13, color:T.text2, marginBottom:36, lineHeight:1.65 }}>Your research workspace. Save reports, revisit anytime — no card, no API keys.</div>
            {['Save & revisit your reports','Full DCF + Monte Carlo valuation','Altman Z-Score + Piotroski F quality','Comps table + 5-category risk matrix','BUY / HOLD / SELL + price target','Nothing paywalled — every section included'].map(f=>(
              <div key={f} style={{ display:'flex', gap:10, marginBottom:12, fontSize:13, color:T.text2 }}>
                <span style={{ color:T.green, flexShrink:0 }}>✓</span> {f}
              </div>
            ))}
            <SignUpButton mode="modal">
              <button style={{ display:'block', width:'100%', marginTop:36, background:'transparent', color:T.text, border:`1px solid ${T.border2}`, borderRadius:10, padding:'15px 0', fontFamily:T.mono, fontSize:13, fontWeight:700, cursor:'pointer', transition:'all 0.15s', letterSpacing:0.3 }} onMouseEnter={e=>{e.target.style.borderColor='rgba(124,58,237,0.5)';e.target.style.color='rgba(255,255,255,0.9)'}} onMouseLeave={e=>{e.target.style.borderColor=T.border2;e.target.style.color=T.text}}>Create free account →</button>
            </SignUpButton>
          </Reveal>

          {/* Pro — gradient border */}
          <Reveal delay={0.08} style={{ position:'relative', borderRadius:22, padding:'2px', background:T.grad, boxShadow:'0 0 60px rgba(124,58,237,0.2)' }}>
            <div style={{ background:'#0a0a1a', borderRadius:20, padding:'44px 40px', height:'100%', boxSizing:'border-box' }}>
              <div style={{ position:'absolute', top:14, right:14, background:T.grad, color:'#fff', fontFamily:T.mono, fontSize:8, fontWeight:700, padding:'5px 12px', borderRadius:6, letterSpacing:1.5 }}>COMING SOON</div>
              <div style={{ fontFamily:T.mono, fontSize:10, background:T.grad, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text', textTransform:'uppercase', letterSpacing:2, marginBottom:16 }}>Pro</div>
              <div style={{ display:'flex', alignItems:'baseline', gap:6, marginBottom:6 }}>
                <span style={{ fontFamily:T.mono, fontSize:60, fontWeight:800, color:T.text, lineHeight:1 }}>$49</span>
                <span style={{ fontFamily:T.mono, fontSize:13, color:T.text3 }}>/month</span>
              </div>
              <div style={{ fontSize:13, color:T.text2, marginBottom:36, lineHeight:1.65 }}>No limits. Priority AI. Team access.</div>
              {['Unlimited reports','Cloud report history','Shareable report links','Priority AI (Claude Opus)','Team accounts (3 seats)','Advanced PDF exports'].map(f=>(
                <div key={f} style={{ display:'flex', gap:10, marginBottom:12, fontSize:13, color:T.text2 }}>
                  <span style={{ background:T.grad, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text', flexShrink:0 }}>✓</span> {f}
                </div>
              ))}
              {waitStatus === 'done' ? (
                <div style={{ marginTop:36, padding:'15px 0', textAlign:'center', fontFamily:T.mono, fontSize:12, color:T.violet, background:'rgba(124,58,237,0.08)', border:'1px solid rgba(124,58,237,0.2)', borderRadius:10 }}>✓ You're on the list</div>
              ) : (
                <form onSubmit={joinWaitlist} style={{ marginTop:36, display:'flex', flexDirection:'column', gap:8 }}>
                  <input type="email" value={waitEmail} onChange={e=>setWaitEmail(e.target.value)} placeholder="your@email.com" required style={{ background:'rgba(255,255,255,0.04)', border:`1px solid ${T.border}`, borderRadius:10, padding:'13px 16px', fontFamily:T.mono, fontSize:12, color:T.text, outline:'none', boxSizing:'border-box', width:'100%', transition:'border-color 0.15s' }} onFocus={e=>e.target.style.borderColor='rgba(124,58,237,0.5)'} onBlur={e=>e.target.style.borderColor=T.border} />
                  <button type="submit" disabled={waitStatus==='loading'} style={{ background:T.grad, color:'#fff', border:'none', borderRadius:10, padding:'14px 0', fontFamily:T.mono, fontSize:12, fontWeight:700, cursor:waitStatus==='loading'?'wait':'pointer', letterSpacing:0.5 }}>
                    {waitStatus==='loading' ? 'Joining...' : 'Join the waitlist →'}
                  </button>
                  {waitStatus==='error' && <div style={{ fontSize:11, color:T.red, textAlign:'center' }}>Something went wrong.</div>}
                </form>
              )}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────
const FAQS = [
  { q:'How accurate are the reports?', a:'AXIOM sources all financial data directly from SEC EDGAR\'s XBRL database — the same data Bloomberg uses. The AI analysis is built entirely on that data. Use reports as a starting point, not a final investment decision.' },
  { q:'Which stocks does AXIOM cover?', a:'Any US-listed company that files with the SEC — NYSE, NASDAQ, and OTC. All S&P 500 companies, mid-caps, and most small-caps with XBRL-formatted filings.' },
  { q:'How is AXIOM different from a screener?', a:'Screeners give tables of numbers. AXIOM produces a full written research note — DCF model, comparable company analysis, risk matrix, and an investment recommendation — the same output a junior analyst spends hours on.' },
  { q:'Do I need my own AI API key?', a:'No. AXIOM runs entirely on our infrastructure. Create a free account and generate reports immediately — no keys, no configuration, no setup.' },
  { q:'Is it really free? What\'s the catch?', a:'No catch. You can generate a full report right now with no signup. Creating a free account lets you save your reports, revisit them anytime, and build a research library — every section is included, nothing is paywalled on the free tier.' },
  { q:'When is Pro launching?', a:'Soon. Pro will offer unlimited reports, cloud history, shareable links, and priority AI models. Join the waitlist above to get early access.' },
]
function FAQ() {
  const [open, setOpen] = useState(null)
  return (
    <section id="faq" style={{ padding:'120px 24px', borderTop:`1px solid ${T.border}`, background:'rgba(255,255,255,0.01)' }}>
      <div style={{ maxWidth:680, margin:'0 auto' }}>
        <Reveal style={{ textAlign:'center', marginBottom:60 }}>
          <div style={{ fontFamily:T.mono, fontSize:10, letterSpacing:2, textTransform:'uppercase', marginBottom:12, background:T.grad, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>FAQ</div>
          <h2 style={{ fontFamily:T.sans, fontSize:'clamp(28px,4vw,48px)', fontWeight:900, color:T.text, letterSpacing:'-0.04em', margin:0 }}>Common questions.</h2>
        </Reveal>
        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
          {FAQS.map((f,i)=>(
            <div key={i} style={{ background:open===i?'rgba(124,58,237,0.05)':'rgba(255,255,255,0.02)', border:`1px solid ${open===i?'rgba(124,58,237,0.25)':T.border}`, borderRadius:12, overflow:'hidden', transition:'all 0.2s' }}>
              <button onClick={()=>setOpen(open===i?null:i)} style={{ width:'100%', background:'none', border:'none', padding:'20px 22px', display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer', textAlign:'left' }}>
                <span style={{ fontFamily:T.sans, fontSize:14, fontWeight:500, color:open===i?T.text:T.text2 }}>{f.q}</span>
                <span style={{ fontFamily:T.mono, fontSize:16, color:open===i?T.violet:T.text3, marginLeft:16, flexShrink:0, transform:open===i?'rotate(45deg)':'none', transition:'transform 0.2s, color 0.2s' }}>+</span>
              </button>
              <div style={{ maxHeight:open===i?'300px':'0', overflow:'hidden', transition:'max-height 0.3s ease' }}>
                <div style={{ padding:'0 22px 20px', fontSize:13, color:T.text2, lineHeight:1.85 }}>{f.a}</div>
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
    <section style={{ position:'relative', overflow:'hidden', textAlign:'center', padding:'120px 24px' }}>
      {/* Full gradient background */}
      <div style={{ position:'absolute', inset:0, background:'linear-gradient(135deg, #0d0520 0%, #05071a 40%, #020612 100%)' }} />
      <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:900, height:600, borderRadius:'50%', background:'radial-gradient(ellipse, rgba(124,58,237,0.2) 0%, rgba(37,99,235,0.1) 40%, transparent 70%)', pointerEvents:'none' }} />
      <div style={{ position:'absolute', inset:0, backgroundImage:`linear-gradient(rgba(124,58,237,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(124,58,237,0.04) 1px, transparent 1px)`, backgroundSize:'60px 60px' }} />
      <Reveal style={{ position:'relative', zIndex:1, maxWidth:640, margin:'0 auto' }}>
        <h2 style={{ fontFamily:T.sans, fontSize:'clamp(40px,6vw,72px)', fontWeight:900, color:T.text, letterSpacing:'-0.05em', margin:'0 0 18px', lineHeight:0.95 }}>
          Start your first<br />
          <GradientText>free report now.</GradientText>
        </h2>
        <p style={{ fontFamily:T.sans, fontSize:17, color:T.text2, margin:'0 auto 44px', lineHeight:1.75, maxWidth:440 }}>
          Institutional equity research on any US stock in under 60 seconds. No card. No setup.
        </p>
        <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
          {isSignedIn ? (
            <GradBtn onClick={()=>navigate('/app')} style={{ fontSize:14, padding:'16px 44px' }}>Open AXIOM →</GradBtn>
          ) : (
            <>
              <SignUpButton mode="modal">
                <GradBtn style={{ fontSize:14, padding:'16px 40px' }}>Create free account →</GradBtn>
              </SignUpButton>
              <SignInButton mode="modal">
                <button style={{ background:'transparent', color:T.text2, fontFamily:T.mono, fontSize:13, padding:'16px 28px', borderRadius:10, border:`1px solid ${T.border2}`, cursor:'pointer', transition:'all 0.15s', backdropFilter:'blur(10px)' }} onMouseEnter={e=>{e.target.style.borderColor='rgba(124,58,237,0.4)';e.target.style.color=T.text}} onMouseLeave={e=>{e.target.style.borderColor=T.border2;e.target.style.color=T.text2}}>Sign in</button>
              </SignInButton>
            </>
          )}
        </div>
        <div style={{ display:'flex', justifyContent:'center', gap:24, marginTop:28, flexWrap:'wrap' }}>
          {['No credit card','Unlimited free reports','Data never stored'].map(t=>(
            <span key={t} style={{ fontFamily:T.mono, fontSize:10, color:T.text3, display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ color:T.green }}>✓</span> {t}
            </span>
          ))}
        </div>
      </Reveal>
    </section>
  )
}

// ─── Trending — clickable live-report launchers ───────────────────────────────
const TRENDING = [
  { sym:'NVDA', name:'NVIDIA' }, { sym:'AAPL', name:'Apple' },
  { sym:'TSLA', name:'Tesla' }, { sym:'MSFT', name:'Microsoft' },
  { sym:'AMZN', name:'Amazon' }, { sym:'META', name:'Meta Platforms' },
  { sym:'GOOGL', name:'Alphabet' }, { sym:'AMD', name:'Adv. Micro Devices' },
]
function Trending({ navigate, runDemo, loading }) {
  const { isSignedIn } = useUser()
  function run(sym) {
    if (loading) return
    if (isSignedIn) navigate(`/app?q=${sym}`)
    else runDemo(sym)
  }
  return (
    <Reveal style={{ padding:'56px 24px', borderTop:`1px solid ${T.border}`, borderBottom:`1px solid ${T.border}` }}>
      <div style={{ maxWidth:1000, margin:'0 auto' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:22, flexWrap:'wrap', gap:10 }}>
          <div style={{ fontFamily:T.mono, fontSize:10, color:T.text3, letterSpacing:2.5, textTransform:'uppercase' }}>Trending — run a live report in one click</div>
          <div style={{ display:'flex', alignItems:'center', gap:6, fontFamily:T.mono, fontSize:9, color:T.text3 }}>
            <div style={{ width:5, height:5, borderRadius:'50%', background:T.green, boxShadow:`0 0 8px ${T.green}` }} />
            FREE · NO SIGNUP
          </div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }} className="trending-grid">
          {TRENDING.map(({ sym, name })=>(
            <button key={sym} onClick={()=>run(sym)} disabled={loading} style={{ textAlign:'left', background:'rgba(255,255,255,0.03)', border:`1px solid ${T.border}`, borderRadius:12, padding:'16px 18px', cursor:loading?'wait':'pointer', transition:`all 0.2s ${EASE}`, display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}
              onMouseEnter={e=>{ if(!loading){ e.currentTarget.style.borderColor='rgba(124,58,237,0.45)'; e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.background='rgba(124,58,237,0.06)' } }}
              onMouseLeave={e=>{ e.currentTarget.style.borderColor=T.border; e.currentTarget.style.transform='none'; e.currentTarget.style.background='rgba(255,255,255,0.03)' }}>
              <div style={{ minWidth:0 }}>
                <div style={{ fontFamily:T.mono, fontSize:14, fontWeight:700, color:T.text, letterSpacing:0.5 }}>{sym}</div>
                <div style={{ fontFamily:T.sans, fontSize:11, color:T.text3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</div>
              </div>
              <span style={{ fontFamily:T.mono, fontSize:14, color:'rgba(167,139,250,0.7)', flexShrink:0 }}>→</span>
            </button>
          ))}
        </div>
      </div>
    </Reveal>
  )
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="footer-wrap" style={{ background:T.bg, borderTop:`1px solid ${T.border}`, padding:'32px 40px' }}>
      <div className="footer-inner" style={{ maxWidth:1000, margin:'0 auto', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:16 }}>
        <div>
          <div style={{ fontFamily:T.mono, fontSize:14, fontWeight:800, letterSpacing:6, background:T.grad, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text', marginBottom:6 }}>AXIOM</div>
          <div style={{ fontFamily:T.mono, fontSize:9, color:T.text3 }}>Institutional Equity Research · Not investment advice</div>
        </div>
        <div style={{ display:'flex', gap:28 }}>
          {['Features','Pricing','FAQ'].map(item=>(
            <a key={item} href={`#${item.toLowerCase()}`} style={{ fontFamily:T.sans, fontSize:12, color:T.text3, textDecoration:'none', transition:'color 0.15s' }} onMouseEnter={e=>e.target.style.color=T.text2} onMouseLeave={e=>e.target.style.color=T.text3}>{item}</a>
          ))}
        </div>
        <div style={{ fontFamily:T.mono, fontSize:9, color:T.text3, textAlign:'right', lineHeight:1.9 }}>
          <div>Data: SEC EDGAR · Auth: Clerk · AI: Groq · Infra: Vercel + Neon</div>
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
      @keyframes fadeUp { from { opacity: 0; transform: translateY(28px) } to { opacity: 1; transform: translateY(0) } }
      @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }
      @keyframes orbFloat { 0%,100% { transform: translate(0,0) } 33% { transform: translate(30px,-20px) } 66% { transform: translate(-20px,15px) } }
      /* Fixed nav is 60px — offset anchor jumps so section headers aren't hidden */
      #features, #pricing, #faq { scroll-margin-top: 76px; }
      /* Tabular, lining figures for all marketing numerics (prices, stats, mockup) */
      section, footer, nav { font-variant-numeric: tabular-nums lining-nums; }
      .lift-card:hover { border-color: rgba(124,58,237,0.4) !important; transform: translateY(-6px); box-shadow: 0 24px 60px rgba(0,0,0,0.4), 0 0 40px rgba(124,58,237,0.1); }
      .lift-card:hover .lift-img { transform: scale(1.08); }
      .feat-card { transition: all 0.4s cubic-bezier(0.16,1,0.3,1); }
      .feat-card:hover { transform: translateY(-5px); border-color: rgba(124,58,237,0.35) !important; box-shadow: 0 20px 50px rgba(0,0,0,0.35); }
      @keyframes kenburns { 0% { transform: scale(1) translate(0,0) } 100% { transform: scale(1.15) translate(-2%,-2%) } }
      .kenburns { animation: kenburns 20s ease-in-out infinite alternate; }
      .kenburns-alt { animation-duration: 26s; animation-direction: alternate-reverse; }
      html { scroll-behavior: smooth; }
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; }
        html { scroll-behavior: auto !important; }
      }
      @media (max-width: 1024px) {
        .hero-grid { grid-template-columns: 1fr !important; gap: 40px !important; padding: 48px 24px 60px !important; }
        .demo-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
        .bento-grid { grid-template-columns: 1fr 1fr !important; }
        .bento-grid > *:first-child { grid-column: span 2 !important; }
        .bento-grid > *:nth-child(n+2) { grid-column: span 1 !important; }
      }
      @media (max-width: 768px) {
        .hero-grid { padding: 40px 20px 56px !important; }
        .bento-grid { grid-template-columns: 1fr !important; }
        .bento-grid > * { grid-column: span 1 !important; }
        .pricing-grid { grid-template-columns: 1fr !important; }
        .steps-grid { grid-template-columns: 1fr 1fr !important; }
        .usecases-grid { grid-template-columns: 1fr 1fr !important; }
        .stats-grid { grid-template-columns: 1fr 1fr !important; }
        .trending-grid { grid-template-columns: 1fr 1fr !important; }
        .stat-cell { border-right: none !important; }
        .stat-cell:nth-child(odd) { border-right: 1px solid rgba(255,255,255,0.07) !important; }
        .nav-links { display: none !important; }
      }
      @media (max-width: 480px) {
        .steps-grid { grid-template-columns: 1fr !important; }
        .usecases-grid { grid-template-columns: 1fr !important; }
        .stats-grid { grid-template-columns: 1fr 1fr !important; }
        .hero-mockup { display: none !important; }
        .footer-inner { flex-direction: column !important; align-items: flex-start !important; }
      }
      @media (max-width: 768px) {
        .step-connector { display: none !important; }
        .footer-wrap { padding: 24px 20px !important; }
      }
    `
    document.head.appendChild(style)
    return () => document.head.removeChild(style)
  }, [])

  async function runDemo(t) {
    if (!t?.trim() || loading) return
    const sym = t.trim().toUpperCase()
    setLoading(true); setError(''); setReport(null); setFinancials(null); setProgressPct(10)
    try {
      setProgress('Fetching SEC EDGAR filings...')
      const edgarRes = await fetch(`/api/edgar?ticker=${encodeURIComponent(sym)}`)
      const edgarData = await edgarRes.json()
      if (!edgarRes.ok) throw new Error(edgarData.error || 'SEC EDGAR lookup failed')
      setFinancials(edgarData.financials); setProgressPct(40)
      setProgress('Generating AI analysis...')
      const aiRes = await fetch('/api/demo-ai', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ ticker:sym, financials:edgarData.financials }) })
      const aiData = await aiRes.json()
      if (!aiRes.ok) {
        if (aiData.limitReached) throw new Error('Demo limit reached (1/day). Sign up free for unlimited reports.')
        throw new Error(aiData.error || 'Analysis failed')
      }
      setProgressPct(100); setReport(aiData); setCurrentTicker(sym)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false); setProgress(''); setProgressPct(0)
    }
  }

  if (report) {
    return (
      <div style={{ minHeight:'100vh', background:T.bg, color:T.text }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeIn{from{opacity:0}to{opacity:1}}`}</style>
        <div style={{ position:'sticky', top:0, zIndex:100, background:'rgba(13,5,32,0.92)', backdropFilter:'blur(16px) saturate(160%)', borderBottom:'1px solid rgba(124,58,237,0.25)', padding:'12px 24px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap' }}>
          <div style={{ display:'flex', alignItems:'center', gap:9, flex:1, minWidth:0 }}>
            <span style={{ fontSize:15, flexShrink:0 }}>✨</span>
            <div style={{ fontFamily:T.sans, fontSize:13, color:T.text, fontWeight:600, minWidth:0 }}>
              This is a real {currentTicker} report.
              <span style={{ color:'rgba(167,139,250,0.95)', fontWeight:500 }}> Create a free account to save it, export to PDF & build your library.</span>
            </div>
          </div>
          <div style={{ display:'flex', gap:8, flexShrink:0 }}>
            <button onClick={()=>{ setReport(null); setTicker('') }} style={{ fontFamily:T.mono, fontSize:11, color:T.text2, background:'transparent', border:`1px solid ${T.border}`, borderRadius:6, padding:'7px 14px', cursor:'pointer' }}>← Back</button>
            {clerkEnabled ? (
              <SignUpButton mode="modal">
                <button style={{ fontFamily:T.mono, fontSize:11, color:'#fff', background:T.grad, border:'none', borderRadius:6, padding:'7px 18px', cursor:'pointer', fontWeight:700, boxShadow:'0 2px 14px rgba(124,58,237,0.4)' }}>Save this report — free →</button>
              </SignUpButton>
            ) : (
              <button onClick={()=>navigate('/app')} style={{ fontFamily:T.mono, fontSize:11, color:'#fff', background:T.grad, border:'none', borderRadius:6, padding:'7px 18px', cursor:'pointer', fontWeight:700, boxShadow:'0 2px 14px rgba(124,58,237,0.4)' }}>Save this report — free →</button>
            )}
          </div>
        </div>
        <div style={{ animation:'fadeIn 0.3s ease' }}>
          <ResearchReport ticker={currentTicker} financials={financials||{}} result={report} />
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight:'100vh', background:T.bg, color:T.text, fontFamily:T.sans }}>
      <Nav navigate={navigate} />
      <Hero navigate={navigate} runDemo={runDemo} ticker={ticker} setTicker={setTicker} loading={loading} progress={progress} progressPct={progressPct} error={error} />
      <TickerStrip />
      <Trending navigate={navigate} runDemo={runDemo} loading={loading} />
      <SocialProof />
      <Stats />
      <Features />
      <ForSection />
      <Showcase />
      <HowItWorks />
      <DemoSection />
      <Pricing navigate={navigate} />
      <FAQ />
      <FinalCTA navigate={navigate} />
      <Footer />
    </div>
  )
}
