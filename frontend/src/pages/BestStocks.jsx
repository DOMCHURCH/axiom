// AXIOM home — "Find Best Stocks": scan the market, rank the best stocks of the
// day, click through to a deep research note.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Shell from '../components/Shell.jsx'
import { FactorGrid, RecBadge, ScoreRing } from '../components/ui.jsx'
import { glass, palette as T } from '../lib/tokens.js'
import {
  latestResults, marketOverview, pollJob, runScan, scanResults, scoreColor,
} from '../lib/api.js'

function StockCard({ r, onClick }) {
  const total = r.total_score
  const subs = r.sub_scores || {}
  return (
    <button onClick={onClick} className="ax-card"
      style={{ ...glass, textAlign: 'left', borderRadius: 16,
        padding: 18, cursor: 'pointer', display: 'flex', gap: 16, alignItems: 'center', width: '100%',
        transition: 'all 0.18s cubic-bezier(0.16,1,0.3,1)' }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.accentBd; e.currentTarget.style.background = T.glassHov; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 16px 44px rgba(0,0,0,0.45), 0 0 0 1px ${T.accentBd}, inset 0 1px 0 rgba(255,255,255,0.08)` }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.glass; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = glass.boxShadow }}>
      <div style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 700, color: T.muted2, width: 30,
        textAlign: 'center', flexShrink: 0 }}>#{r.rank}</div>
      <ScoreRing value={total} size={62} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 3 }}>
          <span style={{ fontFamily: T.mono, fontSize: 16, fontWeight: 700, color: T.text }}>{r.ticker}</span>
          <RecBadge rec={r.recommendation} size="sm" />
        </div>
        <div style={{ fontFamily: T.sans, fontSize: 12.5, color: T.text2, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>{r.name || '—'}</div>
        <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted2 }}>{r.sector || 'Sector n/a'}</div>
      </div>
      <div className="ax-hide-sm" style={{ width: 220, flexShrink: 0 }}>
        <FactorGrid scores={subs} compact />
      </div>
    </button>
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
  const abortRef = useRef(false)

  useEffect(() => {
    Promise.all([
      latestResults({ limit: 100 }).catch(() => ({ results: [] })),
      marketOverview().catch(() => null),
    ]).then(([latest, ov]) => {
      setResults(latest?.results || [])
      setOverview(ov)
      setLoaded(true)
    })
  }, [])

  async function findBestStocks() {
    if (scanning) return
    setScanning(true); setError(''); setProgress({ pct: 2, stage: 'Starting scan…' })
    try {
      const { job_id, scan_run_id } = await runScan({})
      await pollJob(job_id, {
        onProgress: (j) => setProgress({ pct: j.progress ?? 0, stage: j.stage || j.status }),
      })
      const res = await scanResults(scan_run_id, { limit: 100 })
      setResults(res.results || [])
      setAsOf(new Date())
      marketOverview().then(setOverview).catch(() => {})
    } catch (e) {
      setError(e.message || 'Scan failed. Check that the backend and OpenRouter/FMP keys are configured.')
    } finally {
      setScanning(false); setProgress({ pct: 0, stage: '' })
    }
  }

  const top = results[0]

  return (
    <Shell footerNote={overview ? `${overview.active ?? overview.companies ?? '—'} stocks in universe` : null}>
      {/* Hero / scan trigger */}
      <div style={{ textAlign: 'center', marginBottom: 32, position: 'relative' }}>
        <div style={{ position: 'absolute', top: -20, left: '50%', transform: 'translateX(-50%)', width: 560,
          height: 260, background: `radial-gradient(ellipse, ${T.accent}0d 0%, transparent 70%)`, pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: T.accentLo,
            border: `1px solid ${T.accentBd}`, borderRadius: 99, padding: '5px 16px', marginBottom: 20 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: T.accent }} />
            <span style={{ fontFamily: T.mono, fontSize: 11, color: T.accent, letterSpacing: 1.5,
              textTransform: 'uppercase' }}>Market scanner</span>
          </div>
          <h1 style={{ fontFamily: T.sans, fontSize: 'clamp(26px,5vw,40px)', fontWeight: 800, letterSpacing: '-0.03em',
            color: T.text, lineHeight: 1.1, marginBottom: 12 }}>The best stocks of the day</h1>
          <p style={{ fontFamily: T.sans, fontSize: 15, color: T.text2, maxWidth: 540, margin: '0 auto 24px',
            lineHeight: 1.6 }}>
            AXIOM scans the US market and ranks every name across six factors — technical, fundamental,
            growth, value, quality, and risk — then writes a deep AI research note on each.
          </p>

          <button onClick={findBestStocks} disabled={scanning}
            style={{ background: scanning ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg,#f5a524,#ffc25a)',
              color: scanning ? T.muted2 : '#1a1206', border: 'none', borderRadius: 14, padding: '15px 40px',
              fontFamily: T.mono, fontSize: 14, fontWeight: 700, letterSpacing: 0.4,
              cursor: scanning ? 'wait' : 'pointer', boxShadow: scanning ? 'none' : `0 8px 30px ${T.accentGlow}`,
              transition: 'all 0.15s' }}>
            {scanning ? 'Scanning market…' : '⚡ Find Best Stocks'}
          </button>

          {scanning && (
            <div style={{ maxWidth: 420, margin: '22px auto 0' }}>
              <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 999, overflow: 'hidden', marginBottom: 9 }}>
                <div style={{ height: '100%', width: `${progress.pct}%`, background: `linear-gradient(90deg,${T.accent},${T.accentHi})`,
                  boxShadow: `0 0 12px ${T.accentGlow}`, borderRadius: 999, transition: 'width 0.5s ease' }} />
              </div>
              <div style={{ fontFamily: T.mono, fontSize: 11, color: T.accent }}>{progress.stage}</div>
            </div>
          )}

          {error && (
            <div style={{ maxWidth: 520, margin: '20px auto 0', background: T.red + '10',
              border: `1px solid ${T.red}30`, borderRadius: 10, padding: '14px 18px', fontFamily: T.mono,
              fontSize: 12, color: T.red, lineHeight: 1.6, textAlign: 'left' }}>{error}</div>
          )}
        </div>
      </div>

      {/* Market overview strip */}
      {overview && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 28 }}>
          {[
            ['Universe', overview.active ?? overview.companies ?? '—'],
            ['Reports generated', overview.reports ?? '—'],
            ['Avg sentiment', overview.avg_sentiment != null ? overview.avg_sentiment.toFixed(2) : '—'],
            ['Last scan', overview.last_scan?.status || '—'],
          ].map(([label, val]) => (
            <div key={label} style={{ fontFamily: T.mono, fontSize: 11, color: T.muted2 }}>
              <span style={{ color: T.text }}>{val}</span> {label}
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {results.length > 0 ? (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontFamily: T.mono, fontSize: 11, color: T.muted, textTransform: 'uppercase',
              letterSpacing: 2 }}>Ranked results · {results.length}</div>
            {top && (
              <div style={{ fontFamily: T.mono, fontSize: 11, color: T.muted2 }}>
                Top pick <span style={{ color: scoreColor(top.total_score), fontWeight: 700 }}>{top.ticker}</span>
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            {results.map((r) => (
              <StockCard key={r.ticker} r={r} onClick={() => navigate(`/stock/${r.ticker}`)} />
            ))}
          </div>
        </>
      ) : loaded && !scanning ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', fontFamily: T.mono, fontSize: 13, color: T.muted2 }}>
          No scan yet — hit <span style={{ color: T.accent }}>Find Best Stocks</span> to rank the market.
        </div>
      ) : null}
    </Shell>
  )
}
