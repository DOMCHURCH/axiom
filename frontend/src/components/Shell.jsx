// AXIOM app shell — a frosty-white glass dashboard that floats inset from the
// viewport edges over the interactive Bayer-dither WebGL background.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DitherBackground from './DitherBackground.jsx'
import { health } from '../lib/api.js'
import { palette as T, shellFrame } from '../lib/tokens.js'

export default function Shell({ children, footerNote }) {
  const navigate = useNavigate()
  const [build, setBuild] = useState(null)
  useEffect(() => { health().then(setBuild).catch(() => {}) }, [])
  return (
    <>
      <DitherBackground />

      {/* inset wrapper — keeps the dashboard off the edges so the background breathes */}
      <div className="ax-inset" style={{ position: 'relative', zIndex: 1, height: '100vh',
        padding: 'clamp(12px, 3vw, 52px)', display: 'flex' }}>
        <div style={{ ...shellFrame, flex: 1, display: 'flex', flexDirection: 'column',
          overflow: 'hidden', minHeight: 0 }}>

          <header className="ax-nav" style={{ display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', padding: '0 22px', height: 62, flexShrink: 0,
            borderBottom: `1px solid ${T.border}`, background: 'rgba(255,255,255,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div onClick={() => navigate('/')} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <div style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center',
                  background: 'linear-gradient(135deg,#f5a524,#ffc25a)', color: '#1a1206', fontFamily: T.mono,
                  fontWeight: 800, fontSize: 15, boxShadow: `0 4px 16px ${T.accentGlow}` }}>A</div>
                <div style={{ fontFamily: T.mono, fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: 3 }}>AXIOM</div>
              </div>
              <div className="ax-hide-sm" style={{ fontFamily: T.mono, fontSize: 9.5, color: T.text2,
                background: T.glass2, border: `1px solid ${T.border}`, borderRadius: 7, padding: '4px 10px',
                letterSpacing: 1 }}>BEST STOCKS OF THE DAY</div>
            </div>
          </header>

          {/* The only scroll container. No blur lives inside it, so scrolling is a
              cheap composite instead of a per-frame blur repaint. */}
          <main className="ax-scroll" style={{ flex: 1, width: '100%', minHeight: 0,
            overflowY: 'auto', overflowX: 'hidden', scrollBehavior: 'smooth',
            overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>
            <div style={{ width: '100%', maxWidth: 1240, margin: '0 auto', padding: 'clamp(16px, 2vw, 28px)' }}>
              {children}
            </div>
          </main>

          <footer className="ax-footer" style={{ minHeight: 34, display: 'flex', alignItems: 'center',
            padding: '7px 22px', gap: 16, flexShrink: 0, flexWrap: 'wrap',
            borderTop: `1px solid ${T.border}`, background: 'rgba(255,255,255,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.green,
                boxShadow: `0 0 8px ${T.green}` }} />
              <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.text2 }}>Live market · SEC EDGAR</span>
            </div>
            <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.border2 }}>·</span>
            <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.text2 }}>OpenRouter · DeepSeek</span>
            {footerNote && (
              <>
                <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.border2 }}>·</span>
                <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.text2 }}>{footerNote}</span>
              </>
            )}
            <span className="ax-hide-sm" style={{ fontFamily: T.mono, fontSize: 9,
              color: T.muted, marginLeft: 'auto', display: 'flex', gap: 10 }}>
              {build && (
                <span title={`branch ${build.branch || '?'} · universe ${build.scan?.universe} · deep ${build.scan?.deep_seconds}s · FMP ${build.scan?.fmp_key ? 'on' : 'off'}`}
                  style={{ color: build.commit ? T.muted : T.red }}>
                  build {build.commit || 'unknown'} · v{build.version}
                </span>
              )}
              <span>click anywhere to ripple</span>
            </span>
          </footer>
        </div>
      </div>
    </>
  )
}
