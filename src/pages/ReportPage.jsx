import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import ResearchReport from '../components/ResearchReport.jsx'
import { exportReportPDF } from '../lib/exportPDF.js'
import { palette, report } from '../lib/tokens.js'

const T = {
  bg: palette.bg, panel: palette.panel, border: palette.border,
  accent: report.accent, muted: palette.muted2, red: report.negative,
  mono: report.mono, sans: report.sans,
}

export default function ReportPage() {
  const { token } = useParams()
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/report?token=${encodeURIComponent(token)}`)
      .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d.error || 'Not found')))
      .then(data => { setReport(data); setLoading(false) })
      .catch(err => { setError(typeof err === 'string' ? err : 'Failed to load report'); setLoading(false) })
  }, [token])

  return (
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: T.sans }}>
      {/* Banner */}
      <div style={{
        background: T.panel, borderBottom: `1px solid ${T.border}`,
        padding: '10px 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontFamily: T.mono, color: T.accent, fontWeight: 700, fontSize: 14 }}>AXIOM</span>
          <span style={{ color: T.muted, fontSize: 13 }}>Shared Report</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {report && (
            <button onClick={() => exportReportPDF(report.ticker, report.result, report.result?.financials || {})} style={{
              color: T.accent, fontSize: 13, background: T.accent + '12',
              fontFamily: T.mono, padding: '6px 14px', cursor: 'pointer',
              border: `1px solid ${T.accent}40`, borderRadius: 4,
            }}>
              ⤓ Export PDF
            </button>
          )}
          <Link to="/" style={{
            color: T.accent, fontSize: 13, textDecoration: 'none',
            fontFamily: T.mono, padding: '6px 14px',
            border: `1px solid ${T.accent}40`, borderRadius: 4,
          }}>
            Generate Your Own →
          </Link>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 16px' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '80px 0', color: T.muted, fontFamily: T.mono, fontSize: 13 }}>
            Loading report...
          </div>
        )}
        {error && (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <div style={{ color: T.red, fontFamily: T.mono, fontSize: 14, marginBottom: 8 }}>Report not found</div>
            <div style={{ color: T.muted, fontSize: 13, marginBottom: 24 }}>{error}</div>
            <Link to="/" style={{ color: T.accent, textDecoration: 'none', fontSize: 13 }}>← Back to AXIOM</Link>
          </div>
        )}
        {report && (
          <>
            <div style={{ marginBottom: 8, color: T.muted, fontSize: 12, fontFamily: T.mono }}>
              Generated {new Date(report.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
            <div id="axiom-report">
              <ResearchReport result={report.result} ticker={report.ticker} financials={report.result?.financials || {}} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
