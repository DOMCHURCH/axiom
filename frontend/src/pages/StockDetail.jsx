// AXIOM stock detail — a premium dashboard: hero identity band, KPI strip, price
// chart + factor scorecard, technical snapshot, fundamentals, and the deep AI note.
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Shell from '../components/Shell.jsx'
import PriceChart from '../components/PriceChart.jsx'
import ReportView from '../components/ReportView.jsx'
import { FactorGrid, RecBadge, ScoreRing, Section, StatTile } from '../components/ui.jsx'
import { ScoreGauge, Sparkline } from '../components/charts.jsx'
import { glass, glassInner, palette as T } from '../lib/tokens.js'
import {
  company, fmtMoney, fmtNum, fmtPct, fundamentals, getReport, makeReport,
  pollJob, prices, scoreColor, technicals,
} from '../lib/api.js'

const RANGES = ['1M', '3M', '6M', '1Y', '5Y']

function DeltaPill({ v, pct }) {
  if (v == null) return null
  const up = v > 0, flat = v === 0
  const col = flat ? T.muted2 : up ? T.green : T.red
  const bg = flat ? 'rgba(255,255,255,0.06)' : up ? T.greenLo : T.redLo
  return (
    <span className="tnum" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: T.mono,
      fontSize: 10.5, padding: '2px 8px', borderRadius: 999, background: bg, color: col }}>
      {flat ? '±' : up ? '▲' : '▼'} ${fmtNum(Math.abs(v), 2)}{pct != null ? ` (${fmtPct(pct)})` : ''}
    </span>
  )
}

export default function StockDetail() {
  const { ticker } = useParams()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [candles, setCandles] = useState([])
  const [range, setRange] = useState('1Y')
  const [funds, setFunds] = useState(null)
  const [tech, setTech] = useState(null)
  const [report, setReport] = useState(null)
  const [loadErr, setLoadErr] = useState('')
  const [genState, setGenState] = useState({ running: false, stage: '', error: '' })

  useEffect(() => {
    let alive = true
    setProfile(null); setLoadErr('')
    company(ticker).then((d) => alive && setProfile(d)).catch((e) => alive && setLoadErr(e.message))
    fundamentals(ticker).then((d) => alive && setFunds(d)).catch(() => {})
    technicals(ticker).then((d) => alive && setTech(d)).catch(() => {})
    getReport(ticker).then((d) => alive && setReport(d?.report || null)).catch(() => {})
    return () => { alive = false }
  }, [ticker])

  useEffect(() => {
    let alive = true
    prices(ticker, range).then((d) => alive && setCandles(d?.candles || [])).catch(() => alive && setCandles([]))
    return () => { alive = false }
  }, [ticker, range])

  async function generateReport() {
    if (genState.running) return
    setGenState({ running: true, stage: 'Queuing analysis…', error: '' })
    try {
      const { job_id } = await makeReport(ticker)
      await pollJob(job_id, { onProgress: (j) => setGenState((s) => ({ ...s, stage: j.stage || j.status })) })
      const d = await getReport(ticker)
      setReport(d?.report || null)
    } catch (e) {
      setGenState((s) => ({ ...s, error: e.message || 'Report generation failed.' }))
    } finally {
      setGenState((s) => ({ ...s, running: false, stage: '' }))
    }
  }

  const scores = profile?.scores
  const period = funds?.periods?.[0]
  const val = period?.valuation_metrics || {}
  const t = tech?.technicals

  // price-derived
  const closes = candles.map((c) => c.close).filter((v) => v != null)
  const lastClose = closes.length ? closes[closes.length - 1] : t?.last_price ?? null
  const prevClose = closes.length > 1 ? closes[closes.length - 2] : null
  const dayChg = lastClose != null && prevClose != null ? lastClose - prevClose : null
  const dayPct = dayChg != null && prevClose ? dayChg / prevClose : null
  const periodRet = closes.length > 1 ? lastClose / closes[0] - 1 : null
  const lo = closes.length ? Math.min(...closes) : null
  const hi = closes.length ? Math.max(...closes) : null
  const rangePct = lastClose != null && lo != null && hi != null && hi > lo ? (lastClose - lo) / (hi - lo) : null

  const rangePills = (
    <div style={{ display: 'flex', gap: 4 }}>
      {RANGES.map((r) => (
        <button key={r} onClick={() => setRange(r)} style={{ fontFamily: T.mono, fontSize: 10,
          color: range === r ? T.accent : T.muted2, background: range === r ? T.accentLo : 'transparent',
          border: `1px solid ${range === r ? T.accentBd : T.border}`, borderRadius: 8, padding: '4px 10px',
          cursor: 'pointer' }}>{r}</button>
      ))}
    </div>
  )

  return (
    <Shell>
      <div style={{ display: 'grid', gap: 16 }}>
        {/* context bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={() => navigate('/')} style={{ display: 'flex', alignItems: 'center', gap: 8,
            fontFamily: T.mono, fontSize: 11, color: T.muted2, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
            onMouseEnter={(e) => (e.currentTarget.style.color = T.text)}
            onMouseLeave={(e) => (e.currentTarget.style.color = T.muted2)}>
            <span style={{ width: 30, height: 30, borderRadius: 999, background: T.glass2, border: `1px solid ${T.border}`,
              display: 'grid', placeItems: 'center', fontSize: 14 }}>←</span>
            Back to best stocks
          </button>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, ...glassInner, borderRadius: 999,
            padding: '5px 12px', fontFamily: T.mono, fontSize: 10, color: T.muted2 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: T.green, boxShadow: `0 0 8px ${T.green}` }} />
            LIVE{candles.length ? ` · AS OF ${candles[candles.length - 1].time}` : ''}
          </span>
        </div>

        {loadErr && (
          <div style={{ background: T.redLo, border: `1px solid ${T.redBd}`, borderRadius: 10,
            padding: '14px 18px', fontFamily: T.mono, fontSize: 12, color: T.red }}>{ticker}: {loadErr}</div>
        )}

        {/* R1 · hero identity band */}
        <div style={{ ...glass, borderRadius: 20, padding: 28, position: 'relative', overflow: 'hidden',
          display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
            background: `radial-gradient(320px 200px at 0% 0%, ${T.accentGlow}, transparent 70%)` }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 22, flex: '1 1 340px', position: 'relative' }}>
            <ScoreRing value={scores?.total} size={112} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                <h1 style={{ fontFamily: T.mono, fontSize: 30, fontWeight: 700, color: T.text, letterSpacing: 1, margin: 0 }}>{ticker}</h1>
                {scores && <RecBadge rec={scores.recommendation} size="lg" />}
              </div>
              <div style={{ fontFamily: T.sans, fontSize: 15, color: T.text2, marginBottom: 3 }}>{profile?.name || '—'}</div>
              <div style={{ fontFamily: T.mono, fontSize: 11, color: T.muted2 }}>
                {profile?.sector || 'Sector n/a'}{profile?.industry ? ` · ${profile.industry}` : ''}
                {profile?.market_cap ? ` · ${fmtMoney(profile.market_cap)} mkt cap` : ''}
              </div>
            </div>
          </div>
          {lastClose != null && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6,
              marginLeft: 'auto', minWidth: 200, position: 'relative' }}>
              <div className="tnum" style={{ fontFamily: T.mono, fontSize: 32, fontWeight: 700, color: T.text, lineHeight: 1 }}>${fmtNum(lastClose, 2)}</div>
              <DeltaPill v={dayChg} pct={dayPct} />
              {closes.length > 1 && <Sparkline data={closes.slice(-40)} width={180} height={40} color="auto" />}
              <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted }}>{range} · {closes.length} sessions</div>
            </div>
          )}
        </div>

        {/* R2 · KPI strip */}
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(184px,1fr))' }}>
          <StatTile label="Last price" value={lastClose != null ? `$${fmtNum(lastClose, 2)}` : '—'}
            sub={dayPct != null ? `${dayPct >= 0 ? '+' : ''}${fmtPct(dayPct)} day` : null} color={T.text} />
          <StatTile label={`Return · ${range}`} value={periodRet != null ? `${periodRet >= 0 ? '+' : ''}${fmtPct(periodRet)}` : '—'}
            color={periodRet == null ? T.text : periodRet >= 0 ? T.green : T.red} />
          <StatTile label="Range" value={lo != null ? `$${fmtNum(lo, 0)}–$${fmtNum(hi, 0)}` : '—'}
            sub={rangePct != null ? `${Math.round(rangePct * 100)}% of range` : null} />
          <StatTile label="Market cap" value={profile?.market_cap ? fmtMoney(profile.market_cap) : '—'}
            sub={profile?.sector || null} />
          <StatTile label="Composite" value={scores?.total != null ? fmtNum(scores.total, 0) : '—'}
            valueColor={scoreColor(scores?.total)} color={scoreColor(scores?.total)} sub={scores?.recommendation || null} />
        </div>

        {/* R3 · chart + scorecard */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'stretch' }}>
          <div style={{ flex: '3 1 460px' }}>
            <Section title="Price" right={rangePills} style={{ height: '100%' }}>
              {candles.length > 0 ? (
                <PriceChart candles={candles} />
              ) : (
                <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: T.mono, fontSize: 12, color: T.muted2 }}>No price history yet — run a scan first.</div>
              )}
            </Section>
          </div>
          <div style={{ flex: '1 1 300px', display: 'flex' }}>
            <Section title="Factor Scorecard" style={{ display: 'flex', flexDirection: 'column', width: '100%' }}
              right={scores?.total != null && <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 700,
                color: scoreColor(scores.total), background: `${scoreColor(scores.total)}1f`,
                border: `1px solid ${scoreColor(scores.total)}45`, borderRadius: 8, padding: '3px 9px' }}>{fmtNum(scores.total, 0)}</span>}>
              {scores ? <FactorGrid scores={scores} /> : (
                <div style={{ fontFamily: T.mono, fontSize: 12, color: T.muted2 }}>Scores appear after a market scan.</div>
              )}
              <div style={{ fontFamily: T.mono, fontSize: 9, color: T.muted2, marginTop: 'auto', paddingTop: 14 }}>Risk inverted — higher = safer</div>
            </Section>
          </div>
        </div>

        {/* R4 · technical snapshot */}
        {t && (
          <Section title="Technical Snapshot">
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', alignItems: 'center' }}>
              {t.rsi != null && <ScoreGauge value={t.rsi} max={100} color={t.rsi > 70 ? T.red : t.rsi < 30 ? T.green : T.accent}
                label="RSI" sublabel={t.rsi > 70 ? 'overbought' : t.rsi < 30 ? 'oversold' : 'neutral'} />}
              {t.trend_score != null && <ScoreGauge value={t.trend_score} max={100} color={scoreColor(t.trend_score)} label="TREND" />}
              <StatTile label="Last price" value={t.last_price != null ? `$${fmtNum(t.last_price)}` : '—'} />
              <StatTile label="Momentum" value={fmtPct(t.momentum)} color={t.momentum >= 0 ? T.green : T.red} />
              <StatTile label="Volatility" value={fmtPct(t.volatility)} />
              <StatTile label="Drawdown" value={fmtPct(t.drawdown)} color={T.red} />
            </div>
          </Section>
        )}

        {/* R5 · fundamentals */}
        <Section title="Fundamentals" right={period?.fiscal_date && <span style={{ fontFamily: T.mono, fontSize: 10, color: T.muted2 }}>{period.fiscal_date}</span>}>
          {period ? (
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))' }}>
              <StatTile label="Revenue" value={fmtMoney(period.revenue)} sub={period.revenue_growth != null ? `${fmtPct(period.revenue_growth)} YoY` : null} />
              <StatTile label="Net margin" value={fmtPct(period.net_margin)} />
              <StatTile label="ROIC" value={fmtPct(period.roic)} />
              <StatTile label="ROE" value={fmtPct(period.roe)} />
              <StatTile label="P/E" value={fmtNum(val.pe, 1)} />
              <StatTile label="EV/EBITDA" value={fmtNum(val.ev_ebitda, 1)} />
            </div>
          ) : (
            <div style={{ fontFamily: T.mono, fontSize: 12, color: T.muted2 }}>No fundamentals ingested yet.</div>
          )}
        </Section>

        {/* R6 · AI research note */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontFamily: T.mono, fontSize: 11, color: T.accent, textTransform: 'uppercase', letterSpacing: 2 }}>AI Research Note</div>
            {(!report || genState.running) && (
              <button onClick={generateReport} disabled={genState.running}
                style={{ fontFamily: T.mono, fontSize: 11, color: genState.running ? T.muted2 : '#1a1206',
                  background: genState.running ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg,#f5a524,#ffc25a)', border: 'none',
                  borderRadius: 10, padding: '9px 17px', cursor: genState.running ? 'wait' : 'pointer', fontWeight: 700,
                  boxShadow: genState.running ? 'none' : `0 6px 20px ${T.accentGlow}` }}>
                {genState.running ? (genState.stage || 'Generating…') : '⚡ Generate deep analysis'}
              </button>
            )}
          </div>
          {genState.error && (
            <div style={{ background: T.redLo, border: `1px solid ${T.redBd}`, borderRadius: 10,
              padding: '12px 16px', fontFamily: T.mono, fontSize: 12, color: T.red, marginBottom: 14 }}>{genState.error}</div>
          )}
          {report ? (
            <ReportView report={report} />
          ) : !genState.running ? (
            <div style={{ ...glass, borderRadius: 16, padding: '32px 22px', textAlign: 'center', fontFamily: T.sans, fontSize: 14, color: T.text2 }}>
              No AI note yet. Generate a deep, balanced research analysis — thesis, bull/bear, catalysts,
              risks and a recommendation — powered by DeepSeek.
            </div>
          ) : null}
        </div>
      </div>
    </Shell>
  )
}
