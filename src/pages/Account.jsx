import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser, useAuth, UserButton, SignInButton } from '@clerk/clerk-react'

const T = {
  bg:       '#050810',
  bg2:      '#07091a',
  bg3:      '#0a0d24',
  panel:    '#0d1228',
  panelHov: '#101530',
  border:   '#1a2744',
  border2:  '#243358',
  accent:   '#0ea5e9',
  accentLo: '#0ea5e910',
  accentBd: '#0ea5e935',
  accentMid:'#0ea5e960',
  green:    '#10b981',
  greenLo:  '#10b98115',
  red:      '#ef4444',
  gold:     '#f59e0b',
  text:     '#f0f6ff',
  text2:    '#94a3b8',
  text3:    '#64748b',
  muted:    '#3d5470',
  muted2:   '#6b849e',
  mono:     "'IBM Plex Mono', 'Courier New', monospace",
  sans:     "'Inter', system-ui, sans-serif",
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
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <div style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 700, color: T.accent, letterSpacing: 4, marginBottom: 28, textShadow: '0 0 30px #0ea5e930' }}>AXIOM</div>
          <div style={{ fontSize: 15, color: T.text2, marginBottom: 28, lineHeight: 1.7 }}>Sign in to view your account.</div>
          <SignInButton mode="modal">
            <button
              style={{ background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)', color: '#000', border: 'none', borderRadius: 10, padding: '13px 36px', fontFamily: T.mono, fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 20px #0ea5e930', transition: 'all 0.15s cubic-bezier(0.4,0,0.2,1)' }}
              onMouseEnter={e => { e.target.style.transform = 'scale(1.02)'; e.target.style.boxShadow = '0 6px 28px #0ea5e950' }}
              onMouseLeave={e => { e.target.style.transform = 'scale(1)'; e.target.style.boxShadow = '0 4px 20px #0ea5e930' }}
            >Sign in</button>
          </SignInButton>
        </div>
      </div>
    )
  }

  const initials = (user?.fullName || user?.firstName || 'U').slice(0, 2).toUpperCase()

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: T.sans }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>

      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', height: 56, borderBottom: `1px solid ${T.border}`, background: `${T.bg2}f8`, backdropFilter: 'blur(20px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            onClick={() => navigate('/')}
            style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 700, color: T.accent, letterSpacing: 4, background: 'none', border: 'none', cursor: 'pointer', transition: 'text-shadow 0.2s', padding: 0 }}
            onMouseEnter={e => e.target.style.textShadow = '0 0 20px #0ea5e950'}
            onMouseLeave={e => e.target.style.textShadow = 'none'}
          >AXIOM</button>
          <div style={{ width: 1, height: 20, background: T.border }} />
          <button
            onClick={() => navigate('/app')}
            style={{ fontFamily: T.mono, fontSize: 11, color: T.muted2, background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.15s', padding: 0 }}
            onMouseEnter={e => e.target.style.color = T.text}
            onMouseLeave={e => e.target.style.color = T.muted2}
          >← App</button>
        </div>
        <UserButton afterSignOutUrl="/" appearance={{ variables: { colorPrimary: T.accent } }} />
      </header>

      <main style={{ maxWidth: 800, margin: '0 auto', padding: '48px 24px 100px' }}>

        {/* Profile card */}
        <div style={{ marginBottom: 28, background: T.panel, border: `1px solid ${T.border}`, borderRadius: 16, padding: '32px 32px', position: 'relative', overflow: 'hidden' }}>
          {/* Top gradient accent */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${T.accentBd}, transparent)` }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
            {/* Avatar */}
            {user?.imageUrl ? (
              <img src={user.imageUrl} alt="" style={{ width: 64, height: 64, borderRadius: '50%', border: `2px solid ${T.accentBd}`, boxShadow: `0 0 20px ${T.accent}20`, flexShrink: 0 }} />
            ) : (
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: `linear-gradient(135deg, ${T.accent}30, ${T.accent}10)`, border: `2px solid ${T.accentBd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: `0 0 20px ${T.accent}20` }}>
                <span style={{ fontFamily: T.mono, fontSize: 20, fontWeight: 700, color: T.accent }}>{initials}</span>
              </div>
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: T.text, marginBottom: 5, letterSpacing: -0.3 }}>
                {user?.fullName || user?.firstName || 'Account'}
              </div>
              <div style={{ fontFamily: T.mono, fontSize: 12, color: T.muted2 }}>
                {user?.primaryEmailAddress?.emailAddress}
              </div>
            </div>
            <div style={{ fontFamily: T.mono, fontSize: 9, color: T.muted, background: T.bg3, border: `1px solid ${T.border}`, borderRadius: 5, padding: '5px 12px', letterSpacing: 1.2, textTransform: 'uppercase', flexShrink: 0 }}>
              Free Plan
            </div>
          </div>
        </div>

        {/* Usage card */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 14 }}>Monthly Usage</div>
          <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 14, padding: '28px 28px', transition: 'border-color 0.2s' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18 }}>
              <div>
                <div style={{ fontFamily: T.mono, fontSize: 36, fontWeight: 700, color: T.text, lineHeight: 1, marginBottom: 6 }}>
                  {usage ? usage.used : '–'}<span style={{ fontSize: 18, color: T.muted2, fontWeight: 400 }}>/{FREE_LIMIT}</span>
                </div>
                <div style={{ fontFamily: T.mono, fontSize: 11, color: T.muted2 }}>reports used this month</div>
              </div>
              {resetDate && (
                <div style={{ fontFamily: T.mono, fontSize: 11, color: T.muted, textAlign: 'right', lineHeight: 1.7 }}>
                  <div style={{ color: T.muted }}>Resets</div>
                  <div style={{ color: T.text2 }}>{resetDate}</div>
                </div>
              )}
            </div>
            {/* Progress bar */}
            <div style={{ height: 6, background: T.border, borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
              <div style={{
                height: '100%',
                background: usedPct >= 100 ? `linear-gradient(90deg, ${T.red}, ${T.red}cc)` : `linear-gradient(90deg, ${T.accent}, #38bdf8)`,
                width: Math.min(usedPct, 100) + '%',
                borderRadius: 3,
                transition: 'width 0.6s ease',
                boxShadow: usedPct >= 100 ? `0 0 8px ${T.red}40` : `0 0 8px ${T.accent}40`,
              }} />
            </div>
            <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted, marginBottom: usage?.remaining === 0 ? 16 : 0 }}>
              {usage ? `${usage.remaining} report${usage.remaining !== 1 ? 's' : ''} remaining` : ''}
            </div>
            {usage?.remaining === 0 && (
              <div style={{ padding: '14px 18px', background: T.accentLo, border: `1px solid ${T.accentBd}`, borderRadius: 8, fontFamily: T.mono, fontSize: 11, color: T.accent, lineHeight: 1.65 }}>
                Pro plan coming soon — unlimited reports, cloud history, shareable links.
              </div>
            )}
          </div>
        </div>

        {/* Report history */}
        <div>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 14 }}>Report History</div>
          {loadingReports ? (
            <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 14, padding: '32px 24px', textAlign: 'center' }}>
              <div style={{ fontFamily: T.mono, fontSize: 11, color: T.muted, animation: 'pulse 1.5s infinite' }}>Loading reports...</div>
            </div>
          ) : reports.length === 0 ? (
            <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 14, padding: '52px 24px', textAlign: 'center' }}>
              {/* Empty state icon */}
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: T.accentLo, border: `1px solid ${T.accentBd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', fontSize: 20 }}>
                <span style={{ fontFamily: T.mono, color: T.accent }}>◎</span>
              </div>
              <div style={{ fontFamily: T.sans, fontSize: 15, fontWeight: 600, color: T.text2, marginBottom: 8 }}>No reports yet</div>
              <div style={{ fontFamily: T.mono, fontSize: 11, color: T.muted, marginBottom: 24 }}>Generate your first equity research report below.</div>
              <button onClick={() => navigate('/app')}
                style={{ background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)', color: '#000', border: 'none', borderRadius: 9, padding: '11px 28px', fontFamily: T.mono, fontSize: 12, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 16px #0ea5e930', transition: 'all 0.15s cubic-bezier(0.4,0,0.2,1)', letterSpacing: 0.3 }}
                onMouseEnter={e => { e.target.style.transform = 'scale(1.02)'; e.target.style.boxShadow = '0 6px 24px #0ea5e950' }}
                onMouseLeave={e => { e.target.style.transform = 'scale(1)'; e.target.style.boxShadow = '0 4px 16px #0ea5e930' }}
              >
                Generate your first report →
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {reports.map(r => {
                const rec = r.result?.structured?.recommendation
                const recColor = REC_COLOR[rec]
                const target = r.result?.structured?.targetPrice
                const company = r.result?.structured?.companyDescription?.split('.')[0]
                return (
                  <div key={r.id} style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 10, padding: '15px 20px', display: 'flex', alignItems: 'center', gap: 18, transition: 'all 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = T.accentBd; e.currentTarget.style.background = T.panelHov; e.currentTarget.style.boxShadow = `inset 3px 0 0 ${T.accent}` }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.panel; e.currentTarget.style.boxShadow = 'none' }}
                  >
                    <div style={{ fontFamily: T.mono, fontSize: 15, fontWeight: 700, color: T.text, minWidth: 58, letterSpacing: 0.5 }}>{r.ticker}</div>
                    <div style={{ flex: 1, fontSize: 12, color: T.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: T.sans }}>{company || ''}</div>
                    {target && <div style={{ fontFamily: T.mono, fontSize: 11, color: T.muted2, flexShrink: 0 }}>${Math.round(target)}</div>}
                    {rec && (
                      <div style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 700, color: recColor, background: recColor + '18', border: `1px solid ${recColor}35`, borderRadius: 5, padding: '3px 10px', letterSpacing: 0.8, flexShrink: 0, boxShadow: `0 0 8px ${recColor}20` }}>{rec}</div>
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
