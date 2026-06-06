import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, useUser } from '@clerk/clerk-react'

const T = {
  bg: '#050810', bg2: '#07091a', bg3: '#0a0d24',
  panel: '#0d1228', panelHov: '#101530',
  border: '#1a2744', border2: '#243358',
  accent: '#0ea5e9', accentLo: '#0ea5e910', accentBd: '#0ea5e935',
  green: '#10b981', red: '#ef4444', gold: '#f59e0b',
  text: '#f0f6ff', text2: '#94a3b8', text3: '#64748b', muted: '#3d5470', muted2: '#6b849e',
  mono: "'IBM Plex Mono','Courier New',monospace",
  sans: "'Inter',system-ui,sans-serif",
}
const REC_COLOR = { BUY: '#10b981', HOLD: '#f59e0b', SELL: '#ef4444' }

export default function HistoryPage() {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { getToken } = useAuth()
  const { isSignedIn } = useUser()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isSignedIn) { navigate('/'); return }
    getToken().then(token =>
      fetch('/api/reports', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => { setReports(d.reports || []); setLoading(false) })
        .catch(() => { setError('Failed to load history'); setLoading(false) })
    )
  }, [isSignedIn])

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: T.sans }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}.ax-report-row:hover{border-color:${T.accentBd}!important;background:${T.panelHov}!important;box-shadow:inset 3px 0 0 ${T.accent}!important;}`}</style>

      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 clamp(12px,4vw,28px)', height: 56, borderBottom: `1px solid ${T.border}`, background: `${T.bg2}f8`, backdropFilter: 'blur(20px)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div onClick={() => navigate('/')} style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 700, color: T.accent, letterSpacing: 4, cursor: 'pointer' }}>AXIOM</div>
          <div style={{ width: 1, height: 24, background: T.border }} />
          <button onClick={() => navigate('/app')} style={{ fontFamily: T.mono, fontSize: 11, color: T.muted2, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
            ← Back to search
          </button>
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted, background: T.bg3, border: `1px solid ${T.border}`, borderRadius: 5, padding: '3px 9px', letterSpacing: 1 }}>REPORT HISTORY</div>
      </header>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: 'clamp(24px,5vw,48px) clamp(14px,4vw,24px)' }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontFamily: T.mono, fontSize: 22, fontWeight: 700, color: T.text, letterSpacing: -0.5, marginBottom: 6 }}>Report History</h1>
          <p style={{ fontFamily: T.sans, fontSize: 13, color: T.text2 }}>All reports you've generated — saved to your account.</p>
        </div>

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: T.muted2, fontFamily: T.mono, fontSize: 12 }}>
            <div style={{ width: 14, height: 14, border: `2px solid ${T.accent}30`, borderTopColor: T.accent, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            Loading reports...
          </div>
        )}

        {error && (
          <div style={{ background: T.red + '10', border: `1px solid ${T.red}30`, borderRadius: 10, padding: '14px 18px', fontFamily: T.mono, fontSize: 12, color: T.muted2 }}>{error}</div>
        )}

        {!loading && !error && reports.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
            <div style={{ fontFamily: T.mono, fontSize: 14, color: T.text2, marginBottom: 8 }}>No reports yet</div>
            <div style={{ fontFamily: T.sans, fontSize: 13, color: T.muted2, marginBottom: 24 }}>Run your first analysis to get started.</div>
            <button onClick={() => navigate('/app')} style={{ fontFamily: T.mono, fontSize: 12, color: T.accent, background: T.accentLo, border: `1px solid ${T.accentBd}`, borderRadius: 8, padding: '10px 22px', cursor: 'pointer' }}>
              Generate a report →
            </button>
          </div>
        )}

        {!loading && reports.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, animation: 'fadeIn 0.25s ease' }}>
            {reports.map(r => {
              const rec = r.result?.structured?.recommendation
              const recColor = REC_COLOR[rec]
              const target = r.result?.structured?.targetPrice
              const fin = r.result?.financials || {}
              const date = new Date(r.created_at)
              return (
                <div key={r.id} className="ax-report-row" onClick={() => navigate(`/report/${r.id}`)} style={{
                  background: T.panel, border: `1px solid ${T.border}`, borderRadius: 10,
                  padding: 'clamp(12px,2vw,16px) clamp(14px,3vw,20px)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center',
                  gap: 'clamp(10px,2vw,18px)', transition: 'all 0.15s',
                }}>
                  {/* Ticker */}
                  <div style={{ fontFamily: T.mono, fontSize: 15, fontWeight: 700, color: T.text, minWidth: 52, flexShrink: 0 }}>{r.ticker}</div>

                  {/* Company + date */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: T.sans, fontSize: 13, color: T.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {fin.companyName || ''}
                    </div>
                    <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted, marginTop: 2 }}>
                      {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  </div>

                  {/* Target price */}
                  {target != null && (
                    <div style={{ fontFamily: T.mono, fontSize: 12, color: T.muted2, flexShrink: 0 }}>
                      <span style={{ fontSize: 9, color: T.muted }}>PT </span>${Math.round(target)}
                    </div>
                  )}

                  {/* Rec badge */}
                  {rec && (
                    <div style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 700, color: recColor, background: recColor + '18', border: `1px solid ${recColor}35`, borderRadius: 5, padding: '3px 9px', letterSpacing: 0.8, flexShrink: 0 }}>{rec}</div>
                  )}

                  {/* Arrow */}
                  <div style={{ color: T.muted, fontSize: 14, flexShrink: 0 }}>→</div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
