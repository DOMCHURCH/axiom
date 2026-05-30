import { fmt, fmtDollar, pct, pctSigned, fmtMultiple, runDCF, dcfSensitivity } from '../lib/dcf.js'

const C = {
  bg: '#0a0a0a',
  panel: '#111',
  panel2: '#141414',
  border: '#1e1e1e',
  border2: '#252525',
  accent: '#38bdf8',
  accentDim: '#38bdf815',
  positive: '#22c55e',
  negative: '#f87171',
  warning: '#f59e0b',
  muted: '#4b5563',
  muted2: '#6b7280',
  mono: "'IBM Plex Mono', monospace",
  sans: "'Inter', sans-serif",
}

const REC_COLOR = { BUY: C.positive, HOLD: C.warning, SELL: C.negative }
const MOAT_COLOR = { WIDE: C.positive, NARROW: C.warning, NONE: C.negative }
const SEV_COLOR = { HIGH: C.negative, MEDIUM: C.warning, LOW: C.positive }
const RISK_CAT_COLOR = {
  FINANCIAL: '#a78bfa', OPERATIONAL: '#60a5fa',
  REGULATORY: C.warning, COMPETITIVE: C.negative, MACRO: C.muted2,
}

function Label({ children, style }) {
  return (
    <div style={{ fontFamily: C.mono, fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6, ...style }}>
      {children}
    </div>
  )
}

function SectionHeader({ children }) {
  return (
    <div style={{
      fontFamily: C.mono, fontSize: 10, color: C.accent, textTransform: 'uppercase',
      letterSpacing: 2.5, marginBottom: 20, paddingBottom: 10,
      borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8,
    }}>
      {children}
    </div>
  )
}

function Panel({ children, style }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: '24px 28px', ...style }}>
      {children}
    </div>
  )
}

function Badge({ label, color, size = 'sm' }) {
  const padding = size === 'lg' ? '6px 16px' : '3px 9px'
  const fontSize = size === 'lg' ? 13 : 10
  return (
    <span style={{
      display: 'inline-block', fontFamily: C.mono, fontWeight: 700,
      fontSize, padding, borderRadius: 4, letterSpacing: 0.5,
      background: color + '1a', color, border: `1px solid ${color}33`,
    }}>
      {label}
    </span>
  )
}

function Metric({ label, value, sub, color, large }) {
  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '14px 18px' }}>
      <Label>{label}</Label>
      <div style={{ fontFamily: C.mono, fontSize: large ? 22 : 18, fontWeight: 600, color: color || '#e5e5e5', lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontFamily: C.mono, fontSize: 11, color: C.muted2, marginTop: 5 }}>{sub}</div>}
    </div>
  )
}

function BarRow({ label, value, max, color, fmt: fmtFn }) {
  const pctWidth = max ? Math.min(Math.abs(value / max) * 100, 100) : 0
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontFamily: C.mono, fontSize: 12, color: C.muted2 }}>{label}</span>
        <span style={{ fontFamily: C.mono, fontSize: 12, color: color || '#e5e5e5' }}>{fmtFn ? fmtFn(value) : value}</span>
      </div>
      <div style={{ height: 3, background: C.border2, borderRadius: 2 }}>
        <div style={{ height: 3, width: pctWidth + '%', background: color || C.accent, borderRadius: 2, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  )
}

function Divider() {
  return <div style={{ borderTop: `1px solid ${C.border}`, margin: '20px 0' }} />
}

export default function ResearchReport({ ticker, financials: fin, result }) {
  const d = result.structured

  // Sanity-clamp absurd EDGAR values (e.g. period-length mismatches)
  const revenueGrowth = fin.revenueGrowth != null && Math.abs(fin.revenueGrowth) < 5 ? fin.revenueGrowth : null

  // DCF inputs — prefer AI assumptions over raw data
  const fcf = fin.fcf || (fin.operatingCF ? fin.operatingCF * 0.85 : null)
  const dcfIn = {
    fcf,
    nearTermGrowth: d.dcfAssumptions?.nearTermGrowth ?? 0.08,
    longTermGrowth: d.dcfAssumptions?.longTermGrowth ?? 0.05,
    terminalGrowth: d.dcfAssumptions?.terminalGrowthRate ?? 0.025,
    wacc: d.dcfAssumptions?.wacc ?? 0.09,
    shares: fin.shares,
    netDebt: fin.netDebt,
  }
  const dcf = fcf ? runDCF(dcfIn) : null
  const sensitivity = fcf && dcf ? dcfSensitivity(dcfIn) : null

  // Upside: always compute from targetPrice/currentPrice if AI upside looks wrong
  let upside = null
  if (d.targetPrice && d.currentPrice && d.currentPrice > 0) {
    upside = (d.targetPrice - d.currentPrice) / d.currentPrice
  } else if (d.upside != null && Math.abs(d.upside) < 5) {
    upside = d.upside
  }

  const recColor = REC_COLOR[d.recommendation] || C.accent

  const s = {
    root: { maxWidth: 980, margin: '0 auto', padding: '40px 24px 80px', fontFamily: C.sans, color: '#e5e5e5' },
    grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
    grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 },
    grid4: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 },
    body: { fontSize: 14, lineHeight: 1.75, color: '#9ca3af' },
    ul: { listStyle: 'none', padding: 0, margin: 0 },
    li: { display: 'flex', gap: 10, padding: '10px 0', borderBottom: `1px solid ${C.border}`, fontSize: 14, color: '#9ca3af', lineHeight: 1.6, alignItems: 'flex-start' },
    dot: (c) => ({ width: 5, height: 5, borderRadius: '50%', background: c, marginTop: 8, flexShrink: 0 }),
  }

  return (
    <div style={s.root}>

      {/* ── HEADER ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32, flexWrap: 'wrap', gap: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
            <div style={{ fontFamily: C.mono, fontSize: 38, fontWeight: 700, color: '#fff', letterSpacing: -1 }}>
              {ticker.toUpperCase()}
            </div>
            <div style={{
              background: recColor + '1a', color: recColor, border: `1px solid ${recColor}33`,
              fontFamily: C.mono, fontWeight: 700, fontSize: 14, padding: '5px 16px', borderRadius: 5, letterSpacing: 1,
            }}>
              {d.recommendation}
            </div>
            {d.moatRating && (
              <div style={{ fontSize: 11, fontFamily: C.mono, color: MOAT_COLOR[d.moatRating], background: MOAT_COLOR[d.moatRating] + '15', border: `1px solid ${MOAT_COLOR[d.moatRating]}30`, padding: '4px 10px', borderRadius: 4 }}>
                {d.moatRating} MOAT
              </div>
            )}
          </div>
          <div style={{ fontFamily: C.mono, fontSize: 12, color: C.muted2 }}>
            {fin.companyName} · SEC EDGAR · {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
          {d.companyDescription && (
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 8, maxWidth: 500 }}>{d.companyDescription}</div>
          )}
        </div>

        <div style={{ textAlign: 'right' }}>
          {d.targetPrice && (
            <div>
              <Label style={{ textAlign: 'right' }}>12M Price Target</Label>
              <div style={{ fontFamily: C.mono, fontSize: 32, fontWeight: 700, color: '#fff' }}>
                ${typeof d.targetPrice === 'number' ? d.targetPrice.toFixed(2) : d.targetPrice}
              </div>
              {upside != null && (
                <div style={{ fontFamily: C.mono, fontSize: 13, color: upside >= 0 ? C.positive : C.negative, marginTop: 2 }}>
                  {upside >= 0 ? '▲' : '▼'} {Math.abs(upside * 100).toFixed(1)}% {upside >= 0 ? 'upside' : 'downside'}
                  {d.currentPrice && <span style={{ color: C.muted, marginLeft: 8 }}>from ${d.currentPrice}</span>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── EXECUTIVE SUMMARY ── */}
      <Panel style={{ marginBottom: 16 }}>
        <SectionHeader>Executive Summary</SectionHeader>
        <p style={{ ...s.body, fontSize: 15, color: '#c9d1d9', lineHeight: 1.8 }}>{d.executiveSummary}</p>
        {d.investmentThesis && (
          <>
            <Divider />
            <Label>Investment Thesis</Label>
            <p style={{ ...s.body, marginTop: 4 }}>{d.investmentThesis}</p>
          </>
        )}
      </Panel>

      {/* ── KEY METRICS ROW 1 ── */}
      <div style={{ ...s.grid4, marginBottom: 12 }}>
        <Metric
          label="Revenue (TTM)"
          value={fmtDollar(fin.revenue)}
          sub={revenueGrowth != null ? pctSigned(revenueGrowth) + ' YoY' : undefined}
          color={revenueGrowth >= 0 ? C.positive : C.negative}
        />
        <Metric label="Gross Margin" value={pct(fin.grossMargin)} color={fin.grossMargin > 0.5 ? C.positive : fin.grossMargin > 0.3 ? C.warning : C.negative} />
        <Metric label="EBITDA Margin" value={pct(fin.ebitdaMargin)} color={fin.ebitdaMargin > 0.2 ? C.positive : fin.ebitdaMargin > 0.1 ? C.warning : C.negative} />
        <Metric label="FCF Margin" value={pct(fin.fcfMargin)} color={fin.fcfMargin > 0.1 ? C.positive : fin.fcfMargin >= 0 ? C.warning : C.negative} />
      </div>
      <div style={{ ...s.grid4, marginBottom: 16 }}>
        <Metric label="Free Cash Flow" value={fmtDollar(fin.fcf)} color={fin.fcf >= 0 ? C.positive : C.negative} />
        <Metric label="Net Income" value={fmtDollar(fin.netIncome)} color={fin.netIncome >= 0 ? C.positive : C.negative} />
        <Metric label="Net Debt" value={fmtDollar(fin.netDebt)} color={fin.netDebt < 0 ? C.positive : fin.netDebt < fin.ebitda * 3 ? C.warning : C.negative} sub={fin.ebitda && fin.netDebt ? 'ND/EBITDA ' + (fin.netDebt / fin.ebitda).toFixed(1) + 'x' : undefined} />
        <Metric label="ROE" value={pct(fin.roe)} color={fin.roe > 0.15 ? C.positive : fin.roe > 0 ? C.warning : C.negative} />
      </div>

      {/* ── FINANCIAL HIGHLIGHTS COMMENTS ── */}
      {d.financialHighlights && (
        <Panel style={{ marginBottom: 16 }}>
          <SectionHeader>Financial Highlights</SectionHeader>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {[
              ['Revenue', d.financialHighlights.revenueGrowthComment],
              ['Margins', d.financialHighlights.marginComment],
              ['Balance Sheet', d.financialHighlights.balanceSheetComment],
              ['Cash Generation', d.financialHighlights.fcfComment],
            ].map(([k, v]) => v ? (
              <div key={k}>
                <Label>{k}</Label>
                <p style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.65, margin: 0 }}>{v}</p>
              </div>
            ) : null)}
          </div>

          <Divider />

          {/* Margin bar chart */}
          <Label>Margin Structure</Label>
          <div style={{ marginTop: 8 }}>
            {[
              ['Gross Margin', fin.grossMargin, C.positive],
              ['EBITDA Margin', fin.ebitdaMargin, C.accent],
              ['Operating Margin', fin.operatingMargin, '#a78bfa'],
              ['Net Margin', fin.netMargin, C.warning],
              ['FCF Margin', fin.fcfMargin, '#34d399'],
            ].filter(([, v]) => v != null).map(([label, value, color]) => (
              <BarRow key={label} label={label} value={value} max={1} color={color} fmt={pct} />
            ))}
          </div>
        </Panel>
      )}

      {/* ── BULL / BEAR ── */}
      <div style={{ ...s.grid2, marginBottom: 16 }}>
        <Panel>
          <SectionHeader>Bull Case</SectionHeader>
          <ul style={s.ul}>
            {(d.bullCase || []).map((pt, i) => (
              <li key={i} style={s.li}>
                <span style={s.dot(C.positive)} />
                {pt}
              </li>
            ))}
          </ul>
        </Panel>
        <Panel>
          <SectionHeader>Bear Case</SectionHeader>
          <ul style={s.ul}>
            {(d.bearCase || []).map((pt, i) => (
              <li key={i} style={s.li}>
                <span style={s.dot(C.negative)} />
                {pt}
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {/* ── CATALYSTS ── */}
      {d.catalysts && d.catalysts.length > 0 && (
        <Panel style={{ marginBottom: 16 }}>
          <SectionHeader>Near-Term Catalysts</SectionHeader>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {d.catalysts.map((c, i) => (
              <div key={i} style={{
                background: C.accentDim, border: `1px solid ${C.accent}22`,
                borderRadius: 6, padding: '8px 16px', fontSize: 13, color: '#9ca3af',
                borderLeft: `2px solid ${C.accent}`,
              }}>
                {c}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* ── VALUATION / TRADING MULTIPLES ── */}
      {d.tradingMultiples && (
        <Panel style={{ marginBottom: 16 }}>
          <SectionHeader>Valuation Multiples</SectionHeader>
          <div style={s.grid4}>
            {[
              ['EV/Revenue', fmtMultiple(d.tradingMultiples.evRevenue)],
              ['EV/EBITDA', fmtMultiple(d.tradingMultiples.evEbitda)],
              ['P/E', fmtMultiple(d.tradingMultiples.peRatio)],
              ['FCF Yield', d.tradingMultiples.fcfYield != null ? pct(d.tradingMultiples.fcfYield) : 'N/A'],
            ].map(([label, value]) => (
              <Metric key={label} label={label} value={value} />
            ))}
          </div>
        </Panel>
      )}

      {/* ── DCF MODEL ── */}
      {dcf && (
        <Panel style={{ marginBottom: 16 }}>
          <SectionHeader>DCF Valuation Model</SectionHeader>

          <div style={{ ...s.grid4, marginBottom: 20 }}>
            <Metric label="Intrinsic Value / Share" value={dcf.intrinsicValue ? '$' + dcf.intrinsicValue.toFixed(2) : 'N/A'} color={C.accent} large />
            <Metric label="Enterprise Value" value={fmtDollar(dcf.enterpriseValue)} />
            <Metric label="Equity Value" value={fmtDollar(dcf.equityValue)} />
            <Metric label="TV as % of EV" value={dcf.tvAsPctOfEV ? pct(dcf.tvAsPctOfEV) : 'N/A'} color={dcf.tvAsPctOfEV > 0.7 ? C.warning : C.muted2} />
          </div>

          {/* Assumptions */}
          <div style={{ background: C.bg, borderRadius: 6, padding: '14px 18px', marginBottom: 20 }}>
            <Label style={{ marginBottom: 12 }}>Key Assumptions</Label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
              {[
                ['Near-Term Growth (3Y)', pct(dcfIn.nearTermGrowth)],
                ['Long-Term Growth (5Y)', pct(dcfIn.longTermGrowth)],
                ['Terminal Growth', pct(dcfIn.terminalGrowth)],
                ['WACC', pct(dcfIn.wacc)],
                ['Projection Period', '8 years'],
                ['Base FCF', fmtDollar(fcf)],
              ].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontFamily: C.mono, fontSize: 10, color: C.muted, marginBottom: 3 }}>{k}</div>
                  <div style={{ fontFamily: C.mono, fontSize: 13, color: '#e5e5e5' }}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Projected FCF table */}
          <Label style={{ marginBottom: 10 }}>Projected Free Cash Flows</Label>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: C.mono, fontSize: 12 }}>
              <thead>
                <tr>
                  {dcf.projectedFCF.map((_, i) => (
                    <th key={i} style={{ padding: '8px 12px', textAlign: 'right', color: C.muted, borderBottom: `1px solid ${C.border}`, fontWeight: 400 }}>
                      Y{i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {dcf.projectedFCF.map((cf, i) => (
                    <td key={i} style={{ padding: '8px 12px', textAlign: 'right', color: cf >= 0 ? C.positive : C.negative, borderBottom: `1px solid ${C.border}` }}>
                      {fmtDollar(cf)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Sensitivity table */}
          {sensitivity && (
            <>
              <Divider />
              <Label style={{ marginBottom: 10 }}>Sensitivity — Intrinsic Value / Share</Label>
              <div style={{ fontSize: 11, color: C.muted2, marginBottom: 10, fontFamily: C.mono }}>
                Rows: WACC ± 1% &nbsp;|&nbsp; Cols: Terminal Growth ± 0.5%
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', fontFamily: C.mono, fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '8px 14px', color: C.muted, fontWeight: 400, borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}` }}>
                        WACC \ TGR
                      </th>
                      {sensitivity.tgLabels.map(l => (
                        <th key={l} style={{ padding: '8px 14px', textAlign: 'center', color: C.muted, fontWeight: 400, borderBottom: `1px solid ${C.border}` }}>
                          {l}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sensitivity.grid.map((row, ri) => (
                      <tr key={ri}>
                        <td style={{ padding: '8px 14px', color: C.muted2, borderRight: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
                          {sensitivity.waccLabels[ri]}
                        </td>
                        {row.map((val, ci) => {
                          const isCenter = ri === 1 && ci === 1
                          return (
                            <td key={ci} style={{
                              padding: '8px 14px', textAlign: 'center',
                              borderBottom: `1px solid ${C.border}`,
                              background: isCenter ? C.accent + '15' : 'transparent',
                              color: isCenter ? C.accent : val > 0 ? '#e5e5e5' : C.negative,
                              fontWeight: isCenter ? 600 : 400,
                            }}>
                              {val != null ? '$' + val.toFixed(0) : '—'}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Panel>
      )}

      {/* ── COMPS TABLE ── */}
      {d.comps && d.comps.length > 0 && (
        <Panel style={{ marginBottom: 16 }}>
          <SectionHeader>Comparable Company Analysis</SectionHeader>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: C.mono, fontSize: 13 }}>
              <thead>
                <tr>
                  {['Company', 'EV/EBITDA', 'P/E', 'Rev Growth', 'Gross Margin'].map((h, i) => (
                    <th key={h} style={{
                      padding: '10px 14px', textAlign: i === 0 ? 'left' : 'right',
                      color: C.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1,
                      borderBottom: `1px solid ${C.border}`, fontWeight: 400,
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.comps.map((c, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : C.bg + '80' }}>
                    <td style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}` }}>
                      <div style={{ color: C.accent, fontWeight: 600 }}>{c.ticker}</div>
                      {c.name && <div style={{ fontSize: 11, color: C.muted2, marginTop: 2 }}>{c.name}</div>}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', borderBottom: `1px solid ${C.border}`, color: '#e5e5e5' }}>
                      {fmtMultiple(c.evEbitda)}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', borderBottom: `1px solid ${C.border}`, color: '#e5e5e5' }}>
                      {fmtMultiple(c.peRatio)}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', borderBottom: `1px solid ${C.border}`, color: c.revenueGrowth >= 0 ? C.positive : C.negative }}>
                      {c.revenueGrowth != null ? pctSigned(c.revenueGrowth) : 'N/A'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', borderBottom: `1px solid ${C.border}`, color: '#e5e5e5' }}>
                      {c.grossMargin != null ? pct(c.grossMargin) : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* ── RISK MATRIX ── */}
      {d.risks && d.risks.length > 0 && (
        <Panel style={{ marginBottom: 16 }}>
          <SectionHeader>Risk Matrix</SectionHeader>
          <div style={{ display: 'grid', gap: 10 }}>
            {d.risks.map((risk, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '72px auto 1fr',
                gap: 16, alignItems: 'start',
                padding: '14px 16px', borderRadius: 6,
                background: SEV_COLOR[risk.severity] + '08',
                border: `1px solid ${SEV_COLOR[risk.severity]}20`,
              }}>
                <div>
                  <Badge label={risk.severity} color={SEV_COLOR[risk.severity]} />
                </div>
                <div>
                  {risk.category && (
                    <div style={{
                      fontFamily: C.mono, fontSize: 9, color: RISK_CAT_COLOR[risk.category] || C.muted,
                      textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4,
                    }}>
                      {risk.category}
                    </div>
                  )}
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#e5e5e5', whiteSpace: 'nowrap' }}>{risk.title}</div>
                </div>
                <div style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.6 }}>{risk.description}</div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* ── BALANCE SHEET SNAPSHOT ── */}
      <Panel style={{ marginBottom: 16 }}>
        <SectionHeader>Balance Sheet & Capital Structure</SectionHeader>
        <div style={s.grid4}>
          <Metric label="Cash" value={fmtDollar(fin.cash)} color={C.positive} />
          <Metric label="Total Debt" value={fmtDollar(fin.totalDebt)} color={fin.totalDebt > fin.cash ? C.warning : C.positive} />
          <Metric label="Total Equity" value={fmtDollar(fin.totalEquity)} />
          <Metric label="Total Assets" value={fmtDollar(fin.totalAssets)} />
        </div>
        <Divider />
        <div style={{ ...s.grid4, marginTop: 0 }}>
          <Metric label="Current Ratio" value={fmtMultiple(fin.currentRatio)} color={fin.currentRatio > 1.5 ? C.positive : fin.currentRatio > 1 ? C.warning : C.negative} />
          <Metric label="Debt / Equity" value={fmtMultiple(fin.debtToEquity)} color={fin.debtToEquity < 0.5 ? C.positive : fin.debtToEquity < 2 ? C.warning : C.negative} />
          <Metric label="Interest Coverage" value={fmtMultiple(fin.interestCoverage)} color={fin.interestCoverage > 5 ? C.positive : fin.interestCoverage > 2 ? C.warning : C.negative} />
          <Metric label="ROA" value={pct(fin.roa)} color={fin.roa > 0.05 ? C.positive : fin.roa > 0 ? C.warning : C.negative} />
        </div>
      </Panel>

      {/* ── ANALYST NOTE ── */}
      {d.analystNote && (
        <div style={{
          background: recColor + '08',
          border: `1px solid ${recColor}25`,
          borderLeft: `3px solid ${recColor}`,
          borderRadius: 8, padding: '20px 24px',
        }}>
          <Label style={{ color: recColor, marginBottom: 10 }}>Analyst Conviction</Label>
          <p style={{ fontSize: 15, color: '#c9d1d9', lineHeight: 1.8, margin: 0, fontStyle: 'italic' }}>
            {d.analystNote}
          </p>
        </div>
      )}
    </div>
  )
}
