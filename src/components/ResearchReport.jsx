import { fmt, pct, fmtMultiple, runDCF } from '../lib/dcf.js'

const C = {
  bg: '#0a0a0a',
  panel: '#111',
  border: '#1e1e1e',
  accent: '#38bdf8',
  positive: '#22c55e',
  negative: '#f87171',
  muted: '#555',
  mono: "'IBM Plex Mono', monospace",
  sans: "'Inter', sans-serif",
}

function Label({ children }) {
  return <div style={{ fontFamily: C.mono, fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 }}>{children}</div>
}

function Panel({ children, style }) {
  return <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 24, ...style }}>{children}</div>
}

function SectionTitle({ children }) {
  return (
    <div style={{ fontFamily: C.mono, fontSize: 11, color: C.accent, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 20, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
      {children}
    </div>
  )
}

function RatingBadge({ rec }) {
  const color = rec === 'BUY' ? C.positive : rec === 'SELL' ? C.negative : C.accent
  return (
    <div style={{ display: 'inline-block', background: color + '22', color, fontFamily: C.mono, fontSize: 18, fontWeight: 700, padding: '8px 20px', borderRadius: 6, border: `1px solid ${color}44` }}>
      {rec}
    </div>
  )
}

function MetricCard({ label, value, sub, color }) {
  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '16px 20px' }}>
      <Label>{label}</Label>
      <div style={{ fontFamily: C.mono, fontSize: 20, fontWeight: 600, color: color || '#e5e5e5' }}>{value}</div>
      {sub && <div style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

export default function ResearchReport({ ticker, financials, result }) {
  const { structured } = result
  const d = structured

  const dcfInput = {
    fcf: financials.fcf || (financials.operatingCF ? financials.operatingCF * 0.8 : null),
    growthRate: d.dcfAssumptions?.revenueGrowth || 0.08,
    terminalGrowth: d.dcfAssumptions?.terminalGrowthRate || 0.025,
    wacc: d.dcfAssumptions?.wacc || 0.09,
    shares: financials.shares,
    netDebt: financials.netDebt,
  }

  const dcf = dcfInput.fcf ? runDCF(dcfInput) : null

  const upside = d.upside ?? (d.targetPrice && d.currentPrice ? (d.targetPrice - d.currentPrice) / d.currentPrice : null)

  const s = {
    root: { maxWidth: 960, margin: '0 auto', padding: '40px 24px', fontFamily: C.sans },
    header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32, flexWrap: 'wrap', gap: 16 },
    ticker: { fontFamily: C.mono, fontSize: 36, fontWeight: 700, color: '#fff', letterSpacing: -1 },
    meta: { fontFamily: C.mono, fontSize: 12, color: C.muted, marginTop: 4 },
    grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 },
    grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 },
    grid4: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 },
    bodyText: { fontSize: 15, lineHeight: 1.7, color: '#ccc' },
    bulletList: { listStyle: 'none', padding: 0, margin: 0 },
    bullet: { padding: '8px 0', borderBottom: `1px solid ${C.border}`, fontSize: 14, color: '#ccc', display: 'flex', gap: 10, alignItems: 'flex-start', lineHeight: 1.5 },
    dot: (color) => ({ width: 6, height: 6, borderRadius: '50%', background: color, marginTop: 6, flexShrink: 0 }),
    riskRow: { padding: '12px 0', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 16, alignItems: 'flex-start' },
    riskBadge: (sev) => ({
      fontFamily: C.mono, fontSize: 10, padding: '3px 8px', borderRadius: 3, flexShrink: 0,
      background: sev === 'HIGH' ? C.negative + '22' : sev === 'MEDIUM' ? '#f59e0b22' : C.positive + '22',
      color: sev === 'HIGH' ? C.negative : sev === 'MEDIUM' ? '#f59e0b' : C.positive,
    }),
    tableWrap: { overflowX: 'auto' },
    table: { width: '100%', borderCollapse: 'collapse', fontFamily: C.mono, fontSize: 13 },
    th: { padding: '10px 14px', textAlign: 'right', color: C.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, borderBottom: `1px solid ${C.border}` },
    thLeft: { padding: '10px 14px', textAlign: 'left', color: C.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, borderBottom: `1px solid ${C.border}` },
    td: { padding: '10px 14px', textAlign: 'right', borderBottom: `1px solid ${C.border}`, color: '#ccc' },
    tdLeft: { padding: '10px 14px', textAlign: 'left', borderBottom: `1px solid ${C.border}`, color: '#e5e5e5' },
    analystNote: { background: C.accent + '0d', border: `1px solid ${C.accent}22`, borderRadius: 8, padding: 20, fontSize: 14, color: '#ccc', lineHeight: 1.7, fontStyle: 'italic' },
  }

  const km = d.keyMetrics || {}
  const revenue = km.revenue || financials.revenue
  const revenueGrowth = km.revenueGrowth ?? financials.revenueGrowth
  const grossMargin = km.grossMargin ?? financials.grossMargin
  const ebitdaMargin = km.ebitdaMargin
  const netIncome = km.netIncome || financials.netIncome
  const fcf = km.fcf || financials.fcf

  return (
    <div style={s.root}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <div style={s.ticker}>{ticker.toUpperCase()}</div>
          <div style={s.meta}>SEC EDGAR · {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <RatingBadge rec={d.recommendation} />
          {d.targetPrice && (
            <div style={{ marginTop: 12 }}>
              <Label>Price Target</Label>
              <div style={{ fontFamily: C.mono, fontSize: 22, fontWeight: 600, color: '#fff' }}>${d.targetPrice}</div>
              {upside != null && (
                <div style={{ fontFamily: C.mono, fontSize: 12, color: upside >= 0 ? C.positive : C.negative }}>
                  {upside >= 0 ? '+' : ''}{pct(upside)} upside
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Executive Summary */}
      <Panel style={{ marginBottom: 16 }}>
        <SectionTitle>Executive Summary</SectionTitle>
        <p style={s.bodyText}>{d.executiveSummary}</p>
      </Panel>

      {/* Key Metrics */}
      <div style={s.grid4}>
        <MetricCard label="Revenue" value={fmt(revenue)} sub={revenueGrowth != null ? `${revenueGrowth >= 0 ? '+' : ''}${pct(revenueGrowth)} YoY` : null} color={revenueGrowth >= 0 ? C.positive : C.negative} />
        <MetricCard label="Gross Margin" value={pct(grossMargin)} />
        <MetricCard label="EBITDA Margin" value={pct(ebitdaMargin)} />
        <MetricCard label="Free Cash Flow" value={fmt(fcf)} color={fcf >= 0 ? C.positive : C.negative} />
      </div>
      <div style={{ ...s.grid4, marginBottom: 16 }}>
        <MetricCard label="Net Income" value={fmt(netIncome)} color={netIncome >= 0 ? C.positive : C.negative} />
        <MetricCard label="Cash" value={fmt(km.cash || financials.cash)} />
        <MetricCard label="Total Debt" value={fmt(km.totalDebt || financials.totalDebt)} />
        <MetricCard label="Shares Out." value={fmt(km.shares || financials.shares)} />
      </div>

      {/* Investment Thesis — Bull / Bear */}
      <div style={{ ...s.grid2, marginBottom: 16 }}>
        <Panel>
          <SectionTitle>Bull Case</SectionTitle>
          <ul style={s.bulletList}>
            {(d.bullCase || []).map((pt, i) => (
              <li key={i} style={s.bullet}>
                <span style={s.dot(C.positive)} />
                {pt}
              </li>
            ))}
          </ul>
        </Panel>
        <Panel>
          <SectionTitle>Bear Case</SectionTitle>
          <ul style={s.bulletList}>
            {(d.bearCase || []).map((pt, i) => (
              <li key={i} style={s.bullet}>
                <span style={s.dot(C.negative)} />
                {pt}
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {/* DCF Model */}
      {dcf && (
        <Panel style={{ marginBottom: 16 }}>
          <SectionTitle>DCF Valuation</SectionTitle>
          <div style={s.grid4}>
            <MetricCard label="Enterprise Value" value={fmt(dcf.enterpriseValue)} />
            <MetricCard label="Equity Value" value={fmt(dcf.equityValue)} />
            <MetricCard label="Intrinsic Value / Share" value={dcf.intrinsicValue ? `$${dcf.intrinsicValue.toFixed(2)}` : 'N/A'} color={C.accent} />
            <MetricCard label="Terminal Value" value={fmt(dcf.terminalValue)} />
          </div>
          <div style={{ marginTop: 16 }}>
            <Label>Assumptions</Label>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              {[
                ['Revenue Growth', pct(d.dcfAssumptions?.revenueGrowth)],
                ['WACC', pct(d.dcfAssumptions?.wacc)],
                ['Terminal Growth', pct(d.dcfAssumptions?.terminalGrowthRate)],
                ['EBITDA Margin', pct(d.dcfAssumptions?.ebitdaMargin)],
              ].map(([k, v]) => (
                <div key={k} style={{ fontFamily: C.mono, fontSize: 12 }}>
                  <span style={{ color: C.muted }}>{k}: </span>
                  <span style={{ color: '#e5e5e5' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      )}

      {/* Comps Table */}
      {d.comps && d.comps.length > 0 && (
        <Panel style={{ marginBottom: 16 }}>
          <SectionTitle>Comparable Companies</SectionTitle>
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.thLeft}>Ticker</th>
                  <th style={s.th}>EV/EBITDA</th>
                  <th style={s.th}>P/E</th>
                  <th style={s.th}>Rev Growth</th>
                </tr>
              </thead>
              <tbody>
                {d.comps.map((c, i) => (
                  <tr key={i}>
                    <td style={{ ...s.tdLeft, color: C.accent, fontWeight: 600 }}>{c.ticker}</td>
                    <td style={s.td}>{fmtMultiple(c.evEbitda)}</td>
                    <td style={s.td}>{fmtMultiple(c.peRatio)}</td>
                    <td style={{ ...s.td, color: c.revenueGrowth >= 0 ? C.positive : C.negative }}>
                      {c.revenueGrowth != null ? (c.revenueGrowth >= 0 ? '+' : '') + pct(c.revenueGrowth) : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* Key Risks */}
      {d.risks && d.risks.length > 0 && (
        <Panel style={{ marginBottom: 16 }}>
          <SectionTitle>Key Risks</SectionTitle>
          {d.risks.map((risk, i) => (
            <div key={i} style={s.riskRow}>
              <span style={s.riskBadge(risk.severity)}>{risk.severity}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{risk.title}</div>
                <div style={{ fontSize: 13, color: '#999', lineHeight: 1.5 }}>{risk.description}</div>
              </div>
            </div>
          ))}
        </Panel>
      )}

      {/* Analyst Note */}
      {d.analystNote && (
        <div style={s.analystNote}>
          <Label>Analyst Note</Label>
          {d.analystNote}
        </div>
      )}
    </div>
  )
}
