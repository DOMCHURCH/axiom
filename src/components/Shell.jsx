// AXIOM app shell — top nav + status footer, shared by every page.
import { useNavigate } from 'react-router-dom'
import { palette as T } from '../lib/tokens.js'

export default function Shell({ children, footerNote }) {
  const navigate = useNavigate()
  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: T.sans,
      display: 'flex', flexDirection: 'column' }}>
      <header className="ax-nav" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 28px', height: 56, borderBottom: `1px solid ${T.border}`, background: `${T.bg2}f8`,
        backdropFilter: 'blur(20px)', position: 'sticky', top: 0, zIndex: 50, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div onClick={() => navigate('/')} style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 700,
            color: T.accent, letterSpacing: 4, cursor: 'pointer' }}
            onMouseEnter={(e) => (e.currentTarget.style.textShadow = '0 0 20px #0ea5e950')}
            onMouseLeave={(e) => (e.currentTarget.style.textShadow = 'none')}>AXIOM</div>
          <div className="ax-hide-sm" style={{ fontFamily: T.mono, fontSize: 10, color: T.muted,
            background: T.bg3, border: `1px solid ${T.border}`, borderRadius: 5, padding: '3px 9px',
            letterSpacing: 1 }}>BEST STOCKS OF THE DAY</div>
        </div>
      </header>

      <main style={{ flex: 1, width: '100%', maxWidth: 1180, margin: '0 auto', padding: '28px 24px 64px' }}>
        {children}
      </main>

      <footer className="ax-footer" style={{ minHeight: 32, borderTop: `1px solid ${T.border}`, background: T.bg2,
        display: 'flex', alignItems: 'center', padding: '6px 28px', gap: 18, flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: T.green,
            boxShadow: `0 0 6px ${T.green}` }} />
          <span style={{ fontFamily: T.mono, fontSize: 9, color: T.muted }}>Live market · SEC EDGAR</span>
        </div>
        <span style={{ fontFamily: T.mono, fontSize: 9, color: T.border2 }}>|</span>
        <span style={{ fontFamily: T.mono, fontSize: 9, color: T.muted }}>OpenRouter · DeepSeek</span>
        {footerNote && (
          <>
            <span style={{ fontFamily: T.mono, fontSize: 9, color: T.border2 }}>|</span>
            <span style={{ fontFamily: T.mono, fontSize: 9, color: T.muted }}>{footerNote}</span>
          </>
        )}
      </footer>
    </div>
  )
}
