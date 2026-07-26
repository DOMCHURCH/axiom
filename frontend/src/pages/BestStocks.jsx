// AXIOM home — "Find Best Stocks": a premium fintech dashboard. Command bar +
// KPI rail + split body (ranked table panel · market sidebar). Scan the market,
// rank the best stocks of the day, click through to a deep research note.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Shell from '../components/Shell.jsx'
import { FactorGrid, RecBadge, ScoreRing } from '../components/ui.jsx'
import { Sparkline } from '../components/charts.jsx'
import { glass, glassInner, palette as T } from '../lib/tokens.js'
import {
  REC_COLOR, fmtNum, latestResults, marketOverview, pollJob, runScan, scanResults, scoreColor,
} from '../lib/api.js'

// The funnel narrows a ~1.5k-name liquid universe down to this many contenders.
const TOP_N = 10

const FACTORS = ['technical', 'fundamental', 'growth', 'value', 'quality', 'risk']
const FACTOR_LABEL = { technical: 'TECH', fundamental: 'FUND', growth: 'GROW', value: 'VAL', quality: 'QUAL', risk: 'RISK' }
const REC_ORDER = ['Strong Buy', 'Buy', 'Hold', 'Watch', 'Avoid']
const sub = (r) => (k) => (r.sub_scores?.[k] ?? r.sub_scores?.[k + '_score'])

// Shared column templates — identical on the column-header row and every StockRow.
const TPL_WIDE = '34px 52px minmax(150px,1.5fr) 116px 128px 96px 16px'
const TPL_NARROW = '30px 46px minmax(0,1fr) 92px 16px'

// ── Elevated KPI tile (raised glass — distinct from the recessed detail StatTile) ──
function KpiTile({ label, chip, value, valueColor, sub: subNode, glow, onClick }) {
  const El = onClick ? 'button' : 'div'
  const [hov, setHov] = useState(false)
  return (
    <El onClick={onClick}
      onMouseEnter={onClick ? () => setHov(true) : undefined}
      onMouseLeave={onClick ? () => setHov(false) : undefined}
      style={{ ...glass, borderRadius: 18, padding: '16px 18px', minHeight: 104, display: 'flex',
        flexDirection: 'column', gap: 10, position: 'relative', overflow: 'hidden', textAlign: 'left',
        cursor: onClick ? 'pointer' : 'default', width: '100%',
        borderColor: hov ? T.accentBd : T.border, background: hov ? T.glassHov : T.glass,
        transition: 'all .18s cubic-bezier(0.16,1,0.3,1)' }}>
      {glow && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `radial-gradient(180px 120px at 100% 0%, ${T.accentGlow}, transparent 70%)` }} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
        <span style={{ fontFamily: T.mono, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 1, color: T.muted2 }}>{label}</span>
        {chip}
      </div>
      <div className="tnum" style={{ fontFamily: T.mono, fontSize: 26, fontWeight: 700, lineHeight: 1,
        color: valueColor || T.text, position: 'relative' }}>{value}</div>
      {subNode && <div style={{ position: 'relative' }}>{subNode}</div>}
    </El>
  )
}

function Pill({ children, color }) {
  return <span style={{ fontFamily: T.mono, fontSize: 10.5, padding: '2px 8px', borderRadius: 999,
    background: `${color}1a`, color, whiteSpace: 'nowrap' }}>{children}</span>
}

// ── One ranked table row ──
function StockRow({ r, first, wide, onClick }) {
  const [hov, setHov] = useState(false)
  const rankColor = r.rank <= 3 ? T.accent : T.muted2
  // strongest factor, for the sector line
  let topK = null, topV = -1
  for (const k of FACTORS) { const v = sub(r)(k); if (v != null && v > topV) { topV = v; topK = k } }
  const factorBars = FACTORS.map((k) => sub(r)(k))
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: 'grid', gridTemplateColumns: wide ? TPL_WIDE : TPL_NARROW, columnGap: 14,
        alignItems: 'center', width: '100%', textAlign: 'left', minHeight: 66, padding: '0 20px',
        border: 'none', borderTop: first ? 'none' : `1px solid ${T.border}`, cursor: 'pointer', position: 'relative',
        background: hov ? T.glassHov : (r.rank === 1 ? 'rgba(245,165,36,0.045)' : 'transparent'),
        boxShadow: hov ? `inset 2px 0 0 ${T.accent}` : 'none',
        transition: 'all .18s cubic-bezier(0.16,1,0.3,1)' }}>
      {/* rank */}
      <div style={{ textAlign: 'center' }}>
        <div className="tnum" style={{ fontFamily: T.mono, fontSize: 13, fontWeight: r.rank === 1 ? 800 : 700,
          color: hov ? T.accent : rankColor }}>#{r.rank}</div>
        {r.rank === 1 && <div style={{ fontFamily: T.mono, fontSize: 7.5, letterSpacing: 1, color: T.accent, marginTop: 2 }}>TOP</div>}
      </div>
      {/* score ring */}
      <div style={{ flexShrink: 0 }}><ScoreRing value={r.total_score} size={46} /></div>
      {/* company */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 2 }}>
          <span style={{ fontFamily: T.mono, fontSize: 15, fontWeight: 700, color: T.text }}>{r.ticker}</span>
          <RecBadge rec={r.recommendation} size="sm" />
        </div>
        <div style={{ fontFamily: T.sans, fontSize: 12.5, color: T.text2, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name || '—'}</div>
        <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted2, marginTop: 1 }}>
          {r.sector || 'Sector n/a'}
          {topK && <> · top <span style={{ color: scoreColor(topV) }}>{FACTOR_LABEL[topK]} {Math.round(topV)}</span></>}
        </div>
      </div>
      {/* 30D factor-shape sparkline (wide only) */}
      {wide && (
        <div><Sparkline data={factorBars} width={104} height={34} color={T.accent} /></div>
      )}
      {/* factor equalizer (wide only) */}
      {wide && (
        <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end', height: 30 }}>
          {factorBars.map((v, i) => (
            <div key={i} title={`${FACTOR_LABEL[FACTORS[i]]} ${v == null ? '—' : Math.round(v)}`}
              style={{ width: 6, borderRadius: '2px 2px 0 0', height: `${Math.max(3, ((v || 0) / 100) * 30)}px`,
                background: scoreColor(v), opacity: 0.9 }} />
          ))}
        </div>
      )}
      {/* signal (wide only; on narrow the badge shows in the company line) */}
      {wide && <div style={{ textAlign: 'right' }}><RecBadge rec={r.recommendation} size="sm" /></div>}
      {/* chevron */}
      <div style={{ fontFamily: T.mono, fontSize: 15, color: hov ? T.accent : T.muted2,
        transform: hov ? 'translateX(2px)' : 'none', transition: 'all .18s' }}>›</div>
    </button>
  )
}

// ── Compact area chart (market pulse: composite score by rank) ──
function PulseChart({ data, avg }) {
  const pts = (data || []).filter((v) => v != null && isFinite(v))
  if (pts.length < 2) return <div style={{ height: 64 }} />
  const W = 300, H = 64
  const xy = pts.map((v, i) => [ (i / (pts.length - 1)) * W, H - (Math.max(0, Math.min(100, v)) / 100) * H ])
  const line = xy.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ')
  const area = `${line} L ${W} ${H} L 0 ${H} Z`
  const avgY = avg != null ? H - (avg / 100) * H : null
  const last = xy[xy.length - 1]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 64, display: 'block' }}>
      <defs>
        <linearGradient id="pulse" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={T.accent} stopOpacity="0.22" />
          <stop offset="100%" stopColor={T.accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
      {avgY != null && <line x1="0" y1={avgY} x2={W} y2={avgY} stroke={T.accentMid} strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
      <path d={area} fill="url(#pulse)" />
      <path d={line} fill="none" stroke={T.accent} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="2.6" fill={T.accent} />
    </svg>
  )
}

export default function BestStocks() {
  const navigate = useNavigate()
  const [results, setResults] = useState([])
  const [asOf, setAsOf] = useState(null)
  const [overview, setOverview] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState({ pct: 0, stage: '' })
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [wide, setWide] = useState(true)

  useEffect(() => {
    const m = window.matchMedia('(min-width: 900px)')
    const f = (e) => setWide(e.matches)
    setWide(m.matches)
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [])

  useEffect(() => {
    Promise.all([
      latestResults({ limit: TOP_N }).catch(() => ({ results: [] })),
      marketOverview().catch(() => null),
    ]).then(([latest, ov]) => { setResults(latest?.results || []); setOverview(ov); setLoaded(true) })
  }, [])

  async function findBestStocks() {
    if (scanning) return
    setScanning(true); setError(''); setProgress({ pct: 2, stage: 'Starting scan…' })
    try {
      const { job_id, scan_run_id } = await runScan({})
      await pollJob(job_id, {
        onProgress: (j) => setProgress({ pct: j.progress ?? 0, stage: j.stage || j.status, elapsed: j.elapsed }),
      })
      const res = await scanResults(scan_run_id, { limit: TOP_N })
      setResults(res.results || []); setAsOf(new Date())
      marketOverview().then(setOverview).catch(() => {})
    } catch (e) {
      setError(e.message || 'Scan failed. Check the backend + OpenRouter/FMP keys.')
    } finally {
      setScanning(false); setProgress({ pct: 0, stage: '' })
    }
  }

  function refreshLatest() {
    latestResults({ limit: TOP_N }).then((d) => setResults(d?.results || [])).catch(() => {})
  }

  // ── derived ──
  const ranked = results
  const n = ranked.length
  const top = ranked[0]
  const avgScore = n ? Math.round(ranked.reduce((s, r) => s + (r.total_score || 0), 0) / n) : null
  const strongBuys = ranked.filter((r) => r.recommendation === 'Strong Buy').length
  const buyPlus = ranked.filter((r) => ['Strong Buy', 'Buy'].includes(r.recommendation)).length
  const recCounts = REC_ORDER.map((k) => [k, ranked.filter((r) => r.recommendation === k).length])
  const factorAvg = Object.fromEntries(FACTORS.map((k) => {
    const vals = ranked.map((r) => sub(r)(k)).filter((v) => v != null)
    return [k, vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null]
  }))
  const scoreCurve = ranked.map((r) => r.total_score)
  // Funnel counts from the most recent scan run: scanned -> liquidity survivors -> top N
  const counts = overview?.last_scan?.counts || {}
  const scanned = counts.universe ?? null
  // every name with a usable quote is scored from the market snapshot; only the
  // best pre-ranked slice gets full price history within the time budget
  const analyzed = counts.analyzed ?? null
  const deep = counts.deep ?? null
  const survivors = counts.survivors ?? null
  const universe = scanned ?? overview?.active ?? overview?.companies ?? null
  const reports = overview?.reports ?? null
  const sentiment = overview?.avg_sentiment
  const lastScan = overview?.last_scan?.status ?? null
  const sentColor = sentiment == null ? T.muted2 : sentiment > 0.05 ? T.green : sentiment < -0.05 ? T.red : T.accent
  const sentLabel = sentiment == null ? '—' : sentiment > 0.05 ? 'Bullish' : sentiment < -0.05 ? 'Bearish' : 'Neutral'

  const iconBtn = { width: 36, height: 36, borderRadius: 999, background: T.glass2, border: `1px solid ${T.border}`,
    display: 'grid', placeItems: 'center', color: T.text2, cursor: 'pointer', fontSize: 16, flexShrink: 0 }
  const panelHead = { fontFamily: T.mono, fontSize: 11, color: T.accent, textTransform: 'uppercase', letterSpacing: 2, fontWeight: 600 }

  return (
    <Shell footerNote={universe ? `${universe} stocks in universe` : null}>
      <div style={{ display: 'grid', gap: 20 }}>

        {/* ── BLOCK 1 · COMMAND BAR ── */}
        <div style={{ ...glass, borderRadius: 20, padding: '18px 22px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
            background: `radial-gradient(420px 160px at 88% -20%, ${T.accentGlow}, transparent 70%)` }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20,
            flexWrap: 'wrap', position: 'relative' }}>
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: T.accentLo,
                border: `1px solid ${T.accentBd}`, borderRadius: 99, padding: '5px 14px', marginBottom: 12 }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: T.accent }} />
                <span style={{ fontFamily: T.mono, fontSize: 11, color: T.accent, letterSpacing: 1.5, textTransform: 'uppercase' }}>Market scanner</span>
              </div>
              <h1 style={{ fontFamily: T.sans, fontSize: 'clamp(20px,3vw,28px)', fontWeight: 800, letterSpacing: '-0.02em',
                color: T.text, lineHeight: 1.1, margin: 0 }}>Best stocks of the day</h1>
              <div style={{ fontFamily: T.mono, fontSize: 11, color: T.muted2, marginTop: 6 }}>
                {scanned != null
                  ? <>Scanned <span style={{ color: T.text }}>{fmtNum(scanned, 0)}</span>
                      {analyzed != null && <> · analysed <span style={{ color: T.text }}>{fmtNum(analyzed, 0)}</span></>}
                      {deep ? <> · deep <span style={{ color: T.text }}>{fmtNum(deep, 0)}</span></> : null}
                      {' · '}top <span style={{ color: T.accent }}>{n || TOP_N}</span></>
                  : <>Ranks the whole US market down to the top {TOP_N}</>}
                {asOf ? ` · ${asOf.toLocaleTimeString()}` : lastScan ? ` · ${lastScan}` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button title="Reload latest" onClick={refreshLatest} style={iconBtn}
                onMouseEnter={(e) => { e.currentTarget.style.background = T.glassHov; e.currentTarget.style.borderColor = T.border2 }}
                onMouseLeave={(e) => { e.currentTarget.style.background = T.glass2; e.currentTarget.style.borderColor = T.border }}>↻</button>
              <button onClick={findBestStocks} disabled={scanning}
                style={{ background: scanning ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg,#f5a524,#ffc25a)',
                  color: scanning ? T.muted2 : '#1a1206', border: 'none', borderRadius: 14, padding: '13px 28px',
                  fontFamily: T.mono, fontSize: 14, fontWeight: 700, letterSpacing: 0.4,
                  cursor: scanning ? 'wait' : 'pointer', boxShadow: scanning ? 'none' : `0 8px 30px ${T.accentGlow}` }}>
                {scanning ? 'Scanning market…' : (n ? '⚡ Re-run scan' : '⚡ Find Best Stocks')}
              </button>
            </div>
          </div>
          {scanning && (
            <div style={{ marginTop: 14, position: 'relative' }}>
              <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 999, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ height: '100%', width: `${progress.pct}%`, background: `linear-gradient(90deg,${T.accent},${T.accentHi})`,
                  boxShadow: `0 0 12px ${T.accentGlow}`, borderRadius: 999, transition: 'width .5s ease' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontFamily: T.mono, fontSize: 11, color: T.accent }}>{progress.stage}</span>
                {progress.elapsed != null && (
                  <span className="tnum" style={{ fontFamily: T.mono, fontSize: 11, color: T.muted2 }}>
                    {Math.floor(progress.elapsed / 60)}m {String(progress.elapsed % 60).padStart(2, '0')}s
                  </span>
                )}
              </div>
            </div>
          )}
          {error && (
            <div style={{ marginTop: 14, background: T.redLo, border: `1px solid ${T.redBd}`, borderRadius: 10,
              padding: '12px 16px', fontFamily: T.mono, fontSize: 12, color: T.red, position: 'relative' }}>{error}</div>
          )}
        </div>

        {/* ── BLOCK 2 · KPI RAIL ── */}
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: wide ? 'repeat(5,1fr)' : 'repeat(2,1fr)' }}>
          <KpiTile label="Top pick" glow onClick={top ? () => navigate(`/stock/${top.ticker}`) : undefined}
            chip={top && <ScoreRing value={top.total_score} size={34} />}
            value={top ? top.ticker : '—'}
            sub={top && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <RecBadge rec={top.recommendation} size="sm" />
              <span className="tnum" style={{ fontFamily: T.mono, fontSize: 11, color: T.muted2 }}>· {Math.round(top.total_score)}</span>
            </div>} />
          <KpiTile label="Avg score" value={avgScore ?? '—'} valueColor={scoreColor(avgScore)}
            sub={<div style={{ width: '100%' }}>
              <Sparkline data={scoreCurve} width={150} height={26} color={T.accent} />
              <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted2, marginTop: 2 }}>across {n} ranked</div>
            </div>} />
          <KpiTile label="Strong buys" value={strongBuys || (n ? 0 : '—')} valueColor={strongBuys ? T.green : T.text}
            sub={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Pill color={T.green}>{buyPlus} buy-rated</Pill>
              <span style={{ fontFamily: T.mono, fontSize: 10, color: T.muted2 }}>of {n}</span>
            </div>} />
          <KpiTile label="Analysed" value={analyzed != null ? fmtNum(analyzed, 0) : (universe != null ? fmtNum(universe, 0) : '—')}
            sub={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {deep
                ? <><Pill color={T.accent}>{fmtNum(deep, 0)} deep</Pill>
                    <span style={{ fontFamily: T.mono, fontSize: 10, color: T.muted2 }}>→ top {n || TOP_N}</span></>
                : <span style={{ fontFamily: T.mono, fontSize: 11, color: T.muted2 }}>US equities scored</span>}
            </div>} />
          <KpiTile label="Sentiment" value={sentiment != null ? (sentiment > 0 ? '+' : '') + sentiment.toFixed(2) : '—'} valueColor={sentColor}
            sub={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Pill color={sentColor}>{sentLabel}</Pill>
              <span style={{ fontFamily: T.mono, fontSize: 10, color: T.muted2 }}>{reports ?? '—'} notes</span>
            </div>} />
        </div>

        {/* ── BLOCK 3 · SPLIT BODY ── */}
        <div style={{ display: 'grid', gap: 20, gridTemplateColumns: wide ? 'minmax(0,1.7fr) 340px' : '1fr', alignItems: 'start' }}>

          {/* LEFT · ranked table panel */}
          <div style={{ ...glass, borderRadius: 20, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}`, display: 'flex',
              alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={panelHead}>Top Contenders</span>
                <span style={{ fontFamily: T.mono, fontSize: 11, color: T.muted2 }}>· {n}</span>
                {scanning && <span style={{ fontFamily: T.mono, fontSize: 11, color: T.accent }}>{progress.stage}</span>}
              </div>
              {top && <div style={{ fontFamily: T.mono, fontSize: 11, color: T.muted2 }}>
                Top pick <span style={{ color: scoreColor(top.total_score), fontWeight: 700 }}>{top.ticker}</span>
              </div>}
            </div>

            {n > 0 && (
              <div style={{ padding: '9px 20px', borderBottom: `1px solid ${T.border}`, background: T.glass2,
                display: 'grid', gridTemplateColumns: wide ? TPL_WIDE : TPL_NARROW, columnGap: 14, alignItems: 'center',
                fontFamily: T.mono, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 1, color: T.muted2 }}>
                <div style={{ textAlign: 'center' }}>Rank</div>
                <div>Score</div>
                <div>Company</div>
                {wide && <div>30D</div>}
                {wide && <div>Factors</div>}
                {wide && <div style={{ textAlign: 'right' }}>Signal</div>}
                <div />
              </div>
            )}

            {n > 0 ? (
              ranked.map((r, i) => (
                <StockRow key={r.ticker} r={r} first={i === 0} wide={wide} onClick={() => navigate(`/stock/${r.ticker}`)} />
              ))
            ) : loaded && !scanning ? (
              <div style={{ textAlign: 'center', padding: '48px 20px', fontFamily: T.mono, fontSize: 13, color: T.muted2 }}>
                No scan yet — hit <span style={{ color: T.accent }}>Find Best Stocks</span> to rank the market.
              </div>
            ) : (
              [0, 1, 2, 3].map((i) => (
                <div key={i} style={{ height: 66, borderTop: i ? `1px solid ${T.border}` : 'none',
                  padding: '0 20px', display: 'flex', alignItems: 'center' }}>
                  <div className="ax-shimmer" style={{ ...glassInner, height: 34, width: '60%' }} />
                </div>
              ))
            )}
          </div>

          {/* RIGHT · market sidebar */}
          <div style={{ display: 'grid', gap: 20, position: wide ? 'sticky' : 'static', top: 78, alignSelf: 'start' }}>
            {/* Market Pulse */}
            <div style={{ ...glass, borderRadius: 20, padding: 20 }}>
              <div style={{ ...panelHead, marginBottom: 14 }}>Market Pulse</div>
              <PulseChart data={scoreCurve} avg={avgScore} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
                {[['HIGH', n ? Math.round(Math.max(...scoreCurve.filter((v) => v != null))) : '—'],
                  ['AVG', avgScore ?? '—'], ['BREADTH', n]].map(([l, v]) => (
                  <div key={l}>
                    <div className="tnum" style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 700, color: T.text }}>{v}</div>
                    <div style={{ fontFamily: T.mono, fontSize: 9, color: T.muted2, letterSpacing: 1 }}>{l}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted2, marginTop: 10 }}>composite score by rank</div>
            </div>

            {/* Signal Mix */}
            <div style={{ ...glass, borderRadius: 20, padding: 20 }}>
              <div style={{ ...panelHead, marginBottom: 14 }}>Signal Mix</div>
              <div style={{ display: 'flex', height: 12, borderRadius: 999, overflow: 'hidden', background: T.glass2 }}>
                {recCounts.map(([k, c]) => c > 0 && (
                  <div key={k} style={{ flex: c, background: REC_COLOR[k], borderRight: '1px solid rgba(0,0,0,0.25)' }} />
                ))}
              </div>
              <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
                {recCounts.map(([k, c]) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 3, background: REC_COLOR[k] }} />
                    <span style={{ fontFamily: T.mono, fontSize: 11, color: T.text2, flex: 1 }}>{k}</span>
                    <span className="tnum" style={{ fontFamily: T.mono, fontSize: 12, color: T.text }}>{c}</span>
                  </div>
                ))}
              </div>
              {n > 0 && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${T.border}` }}>
                  <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.muted2, letterSpacing: 1, marginBottom: 10 }}>MARKET FACTOR BREADTH</div>
                  <FactorGrid scores={factorAvg} compact />
                </div>
              )}
            </div>

            {/* Top Pick Spotlight */}
            {top && (
              <button onClick={() => navigate(`/stock/${top.ticker}`)}
                style={{ ...glass, borderRadius: 20, padding: 20, textAlign: 'left', cursor: 'pointer', width: '100%' }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = T.accentBd }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = T.border }}>
                <div style={{ ...panelHead, fontSize: 9.5, marginBottom: 14 }}>#1 Top Pick</div>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  <ScoreRing value={top.total_score} size={58} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <span style={{ fontFamily: T.mono, fontSize: 18, fontWeight: 700, color: T.text }}>{top.ticker}</span>
                      <RecBadge rec={top.recommendation} size="sm" />
                    </div>
                    <div style={{ fontFamily: T.sans, fontSize: 12, color: T.text2, overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{top.name || '—'}</div>
                    <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted2 }}>{top.sector || ''}</div>
                  </div>
                </div>
                <div style={{ width: '100%', marginTop: 14 }}>
                  <Sparkline data={FACTORS.map((k) => sub(top)(k))} color="auto" width={280} height={30} />
                  <div style={{ fontFamily: T.mono, fontSize: 8.5, color: T.muted2, letterSpacing: 1, marginTop: 4 }}>FACTOR PROFILE</div>
                </div>
              </button>
            )}
          </div>
        </div>
      </div>
    </Shell>
  )
}
