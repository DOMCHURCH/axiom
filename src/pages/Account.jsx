import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser, useAuth, UserButton, SignInButton } from '@clerk/clerk-react'

const T = {
  bg:      '#05080f',
  bg2:     '#080d16',
  bg3:     '#0c1220',
  panel:   '#0e1525',
  border:  '#1a2640',
  border2: '#243350',
  accent:  '#0ea5e9',
  accentLo:'#0ea5e912',
  accentBd:'#0ea5e938',
  green:   '#10b981',
  red:     '#ef4444',
  gold:    '#f59e0b',
  text:    '#e2e8f0',
  muted:   '#4a6080',
  muted2:  '#7a90a8',
  mono:    "'IBM Plex Mono', monospace",
  sans:    "'Inter', sans-serif",
}

const REC_COLOR = { BUY: '#10b981', HOLD: '#f59e0b', SELL: '#ef4444' }
const FREE_LIMIT = 2

export default function Account() {
  const navigate = useNavigate()
  const { isSignedIn, user } = useUser()
  const { getToken } = useAuth()
  const [usage, setUsage] = useState(null)
  const [reports, setReports] = useState([])
  const [loadingReports, setLoadingReports] = useState(false)

  useEffect(() => {
    if (!isSignedIn) return
    getToken().then(async token => {
      const headers = { Authorization: `Bearer ${token}` }

      fetch('/api/usage', { headers }).then(r => r.json()).then(setUsage).catch(() => {})

      setLoadingReports(true)
      fetch('/api/reports', { headers })
        .then(r => r.json())
        .then(d => setReports(d.reports || []))
        .catch(() => {})
        .finally(() => setLoadingReports(false))
    })
  }, [isSignedIn, getToken])

  const usedPct = usage ? (usage.used / FREE_LIMIT) * 100 : 0
  const resetDate = usage?.resetAt ? new Date(usage.resetAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : null

  if (!isSignedIn) {
    return (
      <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.sans }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 700, color: T.accent, letterSpacing: 3, marginBottom: 24 }}>AXIOM</div>
          <div style={{ fontSize: 15, color: T.muted2, marginBottom: 24 }}>Sign in to view your account.</div>
          <SignInButton mode="modal">
            <button style={{ background: T.accent, color: '#000', border: 'none', borderRadius: 8, padding: '12px 32px', fontFamily: T.mono, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Sign in</button>
          </SignInButton>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: T.sans }}>
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', height: 52, borderBottom: `1px solid ${T.border}`, background: T.bg2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => navigate('/')} style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 700, color: T.accent, letterSpacing: 3, background: 'none', border: 'none', cursor: 'pointer' }}>AXIOM</button>
          <div style={{ width: 1, height: 20, background: T.border }} />
          <button onClick={() => navigate('/app')} style={{ fontFamily: T.mono, fontSize: 11, color: T.muted2, background: 'none', border: 'none', cursor: 'pointer' }}>← App</button>
        </div>
        <UserButton afterSignOutUrl="/" appearance={{ variables: { colorPrimary: T.accent } }} />
      </header>

      <main style={{ maxWidth: 780, margin: '0 auto', padding: '40px 24px 80px' }}>
        {/* Profile */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 40, padding: '24px', background: T.panel, border: `1px solid ${T.border}`, borderRadius: 12 }}>
          {user?.imageUrl && (
            <img src={user.imageUrl} alt="" style={{ width: 56, height: 56, borderRadius: '50%', border: `2px solid ${T.border2}` }} />
          )}
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 4 }}>
              {user?.fullName || user?.firstName || 'Account'}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: 12, color: T.muted2 }}>
              {user?.primaryEmailAddress?.emailAddress}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', fontFamily: T.mono, fontSize: 10, color: T.muted, background: T.bg3, border: `1px solid ${T.border}`, borderRadius: 4, padding: '4px 10px', letterSpacing: 1 }}>
            FREE PLAN
          </div>
        </div>

        {/* Usage */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 14 }}>Monthly Usage</div>
          <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 10, padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: T.mono, fontSize: 32, fontWeight: 700, color: T.text, lineHeight: 1 }}>
                  {usage ? usage.used : '–'}<span style={{ fontSize: 16, color: T.muted2, fontWeight: 400 }}>/{FREE_LIMIT}</span>
                </div>
                <div style={{ fontFamily: T.mono, fontSize: 11, color: T.muted2, marginTop: 6 }}>reports used this month</div>
              </div>
              {resetDate && (
                <div style={{ fontFamily: T.mono, fontSize: 11, color: T.muted, textAlign: 'right' }}>
                  <div>Resets</div>
                  <div style={{ color: T.muted2 }}>{resetDate}</div>
                </div>
              )}
            </div>
            <div style={{ height: 6, background: T.border, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: usedPct >= 100 ? T.red : T.accent, width: Math.min(usedPct, 100) + '%', borderRadius: 3, transition: 'width 0.4s ease' }} />
            </div>
            {usage?.remaining === 0 && (
              <div style={{ marginTop: 16, padding: '12px 14px', background: T.accentLo, border: `1px solid ${T.accentBd}`, borderRadius: 7, fontFamily: T.mono, fontSize: 11, color: T.accent }}>
                Pro plan coming soon — unlimited reports, cloud history, shareable links.
              </div>
            )}
          </div>
        </div>

        {/* Report history */}
        <div>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 14 }}>Report History</div>
          {loadingReports ? (
            <div style={{ fontFamily: T.mono, fontSize: 12, color: T.muted, padding: 20 }}>Loading...</div>
          ) : reports.length === 0 ? (
            <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 10, padding: '40px 24px', textAlign: 'center' }}>
              <div style={{ fontFamily: T.mono, fontSize: 12, color: T.muted, marginBottom: 16 }}>No reports yet</div>
              <button onClick={() => navigate('/app')} style={{ background: T.accent, color: '#000', border: 'none', borderRadius: 7, padding: '10px 24px', fontFamily: T.mono, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                Generate your first report →
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {reports.map(r => {
                const rec = r.result?.structured?.recommendation
                const recColor = REC_COLOR[rec]
                const target = r.result?.structured?.targetPrice
                const company = r.result?.structured?.companyDescription?.split('.')[0]
                return (
                  <div key={r.id} style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 8, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 700, color: T.text, minWidth: 56 }}>{r.ticker}</div>
                    <div style={{ flex: 1, fontSize: 12, color: T.muted2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{company || ''}</div>
                    {target && <div style={{ fontFamily: T.mono, fontSize: 11, color: T.muted2 }}>${Math.round(target)}</div>}
                    {rec && (
                      <div style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 700, color: recColor, background: recColor + '18', border: `1px solid ${recColor}35`, borderRadius: 4, padding: '3px 8px', letterSpacing: 0.8 }}>{rec}</div>
                    )}
                    <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted, flexShrink: 0 }}>
                      {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
