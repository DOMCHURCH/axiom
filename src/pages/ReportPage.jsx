import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import ResearchReport from '../components/ResearchReport.jsx'

async function exportReportPDF(ticker) {
  const { default: html2canvas } = await import('html2canvas')
  const { default: jsPDF } = await import('jspdf')
  const el = document.getElementById('axiom-report')
  if (!el) return
  const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#0a0a0a', logging: false })
  const imgData = canvas.toDataURL('image/png')
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const ratio = pageW / canvas.width
  const scaledH = canvas.height * ratio
  let y = 0
  while (y < scaledH) {
    if (y > 0) pdf.addPage()
    pdf.addImage(imgData, 'PNG', 0, -y, pageW, scaledH)
    y += pageH
  }
  pdf.save(`AXIOM_${ticker}_${new Date().toISOString().slice(0, 10)}.pdf`)
}

const T = {
  bg: '#0a0a0a', panel: '#111', border: '#1e1e1e',
  accent: '#38bdf8', muted: '#6b7280', red: '#f87171',
  mono: "'IBM Plex Mono', monospace", sans: "'Inter', sans-serif",
}

export default function ReportPage() {
  const { id } = useParams()
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/report?id=${id}`)
      .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d.error || 'Not found')))
      .then(data => { setReport(data); setLoading(false) })
      .catch(err => { setError(typeof err === 'string' ? err : 'Failed to load report'); setLoading(false) })
  }, [id])

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
            <button onClick={() => exportReportPDF(report.ticker)} style={{
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
              <ResearchReport data={report.result} ticker={report.ticker} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
