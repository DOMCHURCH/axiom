// AXIOM AI research note — renders the structured report from the backend
// (OpenRouter/DeepSeek). Institutional layout: thesis, bull/bear, catalysts,
// risk matrix, technical & fundamental analysis, recommendation + confidence.
import { report as C } from '../lib/tokens.js'
import { RecBadge, Section } from './ui.jsx'

const SEV_COLOR = { high: C.negative, medium: C.warning, low: C.muted2 }

function Prose({ text }) {
  if (!text) return null
  const paras = String(text).split(/\n{2,}/).filter(Boolean)
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {paras.map((p, i) => (
        <p key={i} style={{ fontFamily: C.sans, fontSize: 14, lineHeight: 1.72, color: '#cbd5e1' }}>{p}</p>
      ))}
    </div>
  )
}

export default function ReportView({ report }) {
  if (!report) return null
  const conf = report.confidence

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {/* Verdict banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 22px' }}>
        <RecBadge rec={report.recommendation} size="lg" />
        {conf != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 200 }}>
            <span style={{ fontFamily: C.mono, fontSize: 10, color: C.muted2, textTransform: 'uppercase',
              letterSpacing: 1 }}>Confidence</span>
            <div style={{ flex: 1, height: 6, background: C.bg, borderRadius: 3, overflow: 'hidden', maxWidth: 220 }}>
              <div style={{ height: '100%', width: `${conf}%`, background: C.accent, borderRadius: 3 }} />
            </div>
            <span className="tnum" style={{ fontFamily: C.mono, fontSize: 12, color: '#e8eef7', fontWeight: 700 }}>{conf}/100</span>
          </div>
        )}
        {report.price_target != null && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
            <span style={{ fontFamily: C.mono, fontSize: 10, color: C.muted2, textTransform: 'uppercase', letterSpacing: 1 }}>Target</span>
            <span className="tnum" style={{ fontFamily: C.mono, fontSize: 16, fontWeight: 700, color: C.accent }}>
              ${Number(report.price_target).toFixed(2)}
            </span>
          </div>
        )}
        {report.model && (
          <span style={{ fontFamily: C.mono, fontSize: 9.5, color: C.muted, marginLeft: 'auto' }}>{report.model}</span>
        )}
      </div>

      {report.company_overview && (
        <Section title="Company Overview"><Prose text={report.company_overview} /></Section>
      )}

      {report.thesis && (
        <Section title="Investment Thesis"><Prose text={report.thesis} /></Section>
      )}

      {/* Bull / Bear */}
      {(report.bull_case || report.bear_case) && (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {report.bull_case && (
            <Section title="Bull Case" style={{ borderColor: C.positive + '33' }}>
              <div style={{ borderLeft: `2px solid ${C.positive}`, paddingLeft: 14 }}><Prose text={report.bull_case} /></div>
            </Section>
          )}
          {report.bear_case && (
            <Section title="Bear Case" style={{ borderColor: C.negative + '33' }}>
              <div style={{ borderLeft: `2px solid ${C.negative}`, paddingLeft: 14 }}><Prose text={report.bear_case} /></div>
            </Section>
          )}
        </div>
      )}

      {/* Catalysts */}
      {report.catalysts?.length > 0 && (
        <Section title="Catalysts">
          <div style={{ display: 'grid', gap: 10 }}>
            {report.catalysts.map((c, i) => (
              <div key={i} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: '13px 15px' }}>
                <div style={{ fontFamily: C.sans, fontSize: 13.5, fontWeight: 600, color: '#e8eef7', marginBottom: 4 }}>
                  {typeof c === 'string' ? c : c.title}
                </div>
                {c.detail && <div style={{ fontFamily: C.sans, fontSize: 13, lineHeight: 1.6, color: '#94a3b8' }}>{c.detail}</div>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Risk matrix */}
      {report.risks?.length > 0 && (
        <Section title="Key Risks">
          <div style={{ display: 'grid', gap: 10 }}>
            {report.risks.map((r, i) => {
              const sev = (r.severity || 'medium').toLowerCase()
              const col = SEV_COLOR[sev] || C.muted2
              return (
                <div key={i} style={{ display: 'flex', gap: 13, background: C.bg, border: `1px solid ${C.border}`,
                  borderRadius: 10, padding: '13px 15px' }}>
                  <div style={{ width: 4, borderRadius: 2, background: col, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <span style={{ fontFamily: C.sans, fontSize: 13.5, fontWeight: 600, color: '#e8eef7' }}>
                        {typeof r === 'string' ? r : r.title}
                      </span>
                      <span style={{ fontFamily: C.mono, fontSize: 9, color: col, textTransform: 'uppercase',
                        letterSpacing: 1, border: `1px solid ${col}44`, borderRadius: 4, padding: '2px 7px' }}>{sev}</span>
                    </div>
                    {r.detail && <div style={{ fontFamily: C.sans, fontSize: 13, lineHeight: 1.6, color: '#94a3b8' }}>{r.detail}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {/* Technical + Fundamental analysis */}
      {report.valuation_analysis && (
        <Section title="Valuation Analysis"><Prose text={report.valuation_analysis} /></Section>
      )}
      {report.technical_analysis && (
        <Section title="Technical Analysis"><Prose text={report.technical_analysis} /></Section>
      )}
      {report.fundamental_analysis && (
        <Section title="Fundamental Analysis"><Prose text={report.fundamental_analysis} /></Section>
      )}

      <div style={{ fontFamily: C.mono, fontSize: 10, color: C.muted, textAlign: 'center', padding: '4px 0' }}>
        AXIOM research is decision-support only — not investment advice. All figures computed from live market &amp; SEC data.
      </div>
    </div>
  )
}
