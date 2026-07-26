// AXIOM app shell — frosted-glass top nav + status footer over an ambient
// charcoal background. Shared by every page.
import { useNavigate } from 'react-router-dom'
import { ambientBg, palette as T } from '../lib/tokens.js'

export default function Shell({ children, footerNote }) {
  const navigate = useNavigate()
  return (
    <div style={{ minHeight: '100vh', background: ambientBg, backgroundAttachment: 'fixed',
      color: T.text, fontFamily: T.sans, display: 'flex', flexDirection: 'column' }}>
      <header className="ax-nav" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 22px', height: 62, position: 'sticky', top: 0, zIndex: 50, flexShrink: 0,
        background: 'rgba(12,13,16,0.55)', backdropFilter: 'blur(22px) saturate(150%)',
        WebkitBackdropFilter: 'blur(22px) saturate(150%)', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div onClick={() => navigate('/')} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center',
              background: 'linear-gradient(135deg,#f5a524,#ffc25a)', color: '#1a1206', fontFamily: T.mono,
              fontWeight: 800, fontSize: 15, boxShadow: `0 4px 16px ${T.accentGlow}` }}>A</div>
            <div style={{ fontFamily: T.mono, fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: 3 }}>AXIOM</div>
          </div>
          <div className="ax-hide-sm" style={{ fontFamily: T.mono, fontSize: 9.5, color: T.muted2,
            background: T.glass, border: `1px solid ${T.border}`, borderRadius: 7, padding: '4px 10px',
            letterSpacing: 1 }}>BEST STOCKS OF THE DAY</div>
        </div>
      </header>

      <main style={{ flex: 1, width: '100%', maxWidth: 1200, margin: '0 auto', padding: '30px 22px 70px', position: 'relative' }}>
        {children}
      </main>

      <footer className="ax-footer" style={{ minHeight: 34, display: 'flex', alignItems: 'center',
        padding: '7px 22px', gap: 16, flexShrink: 0, flexWrap: 'wrap',
        background: 'rgba(12,13,16,0.55)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
        borderTop: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.green,
            boxShadow: `0 0 8px ${T.green}` }} />
          <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.muted2 }}>Live market · SEC EDGAR</span>
        </div>
        <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.border2 }}>·</span>
        <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.muted2 }}>OpenRouter · DeepSeek</span>
        {footerNote && (
          <>
            <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.border2 }}>·</span>
            <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.muted2 }}>{footerNote}</span>
          </>
        )}
      </footer>
    </div>
  )
}
