// AXIOM stock detail — click a best-stock to see the price graph, six-factor
// scorecard, fundamentals, and the deep AI research note.
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Shell from '../components/Shell.jsx'
import PriceChart from '../components/PriceChart.jsx'
import ReportView from '../components/ReportView.jsx'
import { FactorGrid, RecBadge, ScoreRing, Section, StatTile } from '../components/ui.jsx'
import { palette as T } from '../lib/tokens.js'
import {
  company, fmtMoney, fmtNum, fmtPct, fundamentals, getReport, makeReport,
  pollJob, prices, technicals,
} from '../lib/api.js'

const RANGES = ['1M', '3M', '6M', '1Y', '5Y']

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

  // Core profile + auxiliary data
  useEffect(() => {
    let alive = true
    setProfile(null); setLoadErr('')
    company(ticker).then((d) => alive && setProfile(d)).catch((e) => alive && setLoadErr(e.message))
    fundamentals(ticker).then((d) => alive && setFunds(d)).catch(() => {})
    technicals(ticker).then((d) => alive && setTech(d)).catch(() => {})
    getReport(ticker).then((d) => alive && setReport(d?.report || null)).catch(() => {})
    return () => { alive = false }
  }, [ticker])

  // Price series (reloads on range change)
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

  return (
    <Shell>
      <button onClick={() => navigate('/')} style={{ fontFamily: T.mono, fontSize: 11, color: T.muted2,
        background: 'transparent', border: 'none', cursor: 'pointer', marginBottom: 18, padding: 0 }}
        onMouseEnter={(e) => (e.currentTarget.style.color = T.text)}
        onMouseLeave={(e) => (e.currentTarget.style.color = T.muted2)}>← Back to best stocks</button>

      {loadErr && (
        <div style={{ background: T.red + '10', border: `1px solid ${T.red}30`, borderRadius: 10,
          padding: '14px 18px', fontFamily: T.mono, fontSize: 12, color: T.red }}>
          {ticker}: {loadErr}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', marginBottom: 22 }}>
        {scores && <ScoreRing value={scores.total} size={88} />}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <h1 style={{ fontFamily: T.mono, fontSize: 26, fontWeight: 700, color: T.text, letterSpacing: 1 }}>{ticker}</h1>
            {scores && <RecBadge rec={scores.recommendation} size="md" />}
          </div>
          <div style={{ fontFamily: T.sans, fontSize: 15, color: T.text2, marginBottom: 2 }}>{profile?.name || '—'}</div>
          <div style={{ fontFamily: T.mono, fontSize: 11, color: T.muted2 }}>
            {profile?.sector || 'Sector n/a'}{profile?.industry ? ` · ${profile.industry}` : ''}
            {profile?.market_cap ? ` · ${fmtMoney(profile.market_cap)} mkt cap` : ''}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 18 }}>
        {/* Price chart */}
        <Section title="Price" right={
          <div style={{ display: 'flex', gap: 4 }}>
            {RANGES.map((r) => (
              <button key={r} onClick={() => setRange(r)} style={{ fontFamily: T.mono, fontSize: 10,
                color: range === r ? T.accent : T.muted2, background: range === r ? T.accentLo : 'transparent',
                border: `1px solid ${range === r ? T.accentBd : T.border}`, borderRadius: 6, padding: '4px 10px',
                cursor: 'pointer' }}>{r}</button>
            ))}
          </div>
        }>
          {candles.length > 0 ? (
            <PriceChart candles={candles} />
          ) : (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: T.mono, fontSize: 12, color: T.muted2 }}>No price history yet — run a scan first.</div>
          )}
        </Section>

        {/* Scorecard + fundamentals */}
        <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          <Section title="Factor Scorecard">
            {scores ? <FactorGrid scores={scores} /> : (
              <div style={{ fontFamily: T.mono, fontSize: 12, color: T.muted2 }}>Scores appear after a market scan.</div>
            )}
          </Section>

          <Section title="Fundamentals">
            {period ? (
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(2, 1fr)' }}>
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
        </div>

        {/* Technical snapshot */}
        {t && (
          <Section title="Technical Snapshot">
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
              <StatTile label="Last price" value={t.last_price != null ? `$${fmtNum(t.last_price)}` : '—'} />
              <StatTile label="RSI" value={fmtNum(t.rsi, 0)} />
              <StatTile label="Trend" value={fmtNum(t.trend_score, 0)} />
              <StatTile label="Momentum" value={fmtPct(t.momentum)} />
              <StatTile label="Volatility" value={fmtPct(t.volatility)} />
              <StatTile label="Drawdown" value={fmtPct(t.drawdown)} />
            </div>
          </Section>
        )}

        {/* AI research note */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontFamily: T.mono, fontSize: 11, color: T.accent, textTransform: 'uppercase',
              letterSpacing: 2 }}>AI Research Note</div>
            {(!report || genState.running) && (
              <button onClick={generateReport} disabled={genState.running}
                style={{ fontFamily: T.mono, fontSize: 11, color: genState.running ? T.muted : '#001018',
                  background: genState.running ? T.bg3 : 'linear-gradient(135deg,#0ea5e9,#38bdf8)', border: 'none',
                  borderRadius: 8, padding: '8px 16px', cursor: genState.running ? 'wait' : 'pointer', fontWeight: 700 }}>
                {genState.running ? (genState.stage || 'Generating…') : '⚡ Generate deep analysis'}
              </button>
            )}
          </div>
          {genState.error && (
            <div style={{ background: T.red + '10', border: `1px solid ${T.red}30`, borderRadius: 10,
              padding: '12px 16px', fontFamily: T.mono, fontSize: 12, color: T.red, marginBottom: 14 }}>{genState.error}</div>
          )}
          {report ? (
            <ReportView report={report} />
          ) : !genState.running ? (
            <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 14,
              padding: '32px 22px', textAlign: 'center', fontFamily: T.sans, fontSize: 14, color: T.text2 }}>
              No AI note yet. Generate a deep, balanced research analysis — thesis, bull/bear, catalysts,
              risks and a recommendation — powered by DeepSeek.
            </div>
          ) : null}
        </div>
      </div>
    </Shell>
  )
}
