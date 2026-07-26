// Shared AXIOM UI primitives — recommendation badge, score bar, factor grid,
// stat tiles, glass section wrapper. Styled from the glassmorphism token system.
import { glass, glassInner, report as C } from '../lib/tokens.js'
import { REC_COLOR, scoreColor, fmtNum } from '../lib/api.js'

export function RecBadge({ rec, size = 'md' }) {
  if (!rec) return null
  const color = REC_COLOR[rec] || C.muted2
  const pad = size === 'lg' ? '6px 15px' : size === 'sm' ? '3px 9px' : '5px 12px'
  const fs = size === 'lg' ? 13 : size === 'sm' ? 9 : 11
  return (
    <span style={{
      fontFamily: C.mono, fontSize: fs, fontWeight: 700, color,
      background: color + '1f', border: `1px solid ${color}45`, borderRadius: 999,
      padding: pad, letterSpacing: 0.6, whiteSpace: 'nowrap',
      boxShadow: `0 0 18px ${color}22, inset 0 1px 0 rgba(255,255,255,0.06)`,
    }}>{rec.toUpperCase()}</span>
  )
}

export function ScoreBar({ label, value, width }) {
  const color = scoreColor(value)
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ fontFamily: C.mono, fontSize: 10, color: C.muted2, width: width || 84,
        textTransform: 'uppercase', letterSpacing: 0.8, flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 999,
          background: `linear-gradient(90deg, ${color}cc, ${color})`, boxShadow: `0 0 10px ${color}55`,
          transition: 'width 0.5s cubic-bezier(0.16,1,0.3,1)' }} />
      </div>
      <div className="tnum" style={{ fontFamily: C.mono, fontSize: 11, color: value == null ? C.muted : C.text || '#f4f5f7',
        width: 30, textAlign: 'right', flexShrink: 0 }}>{value == null ? '—' : Math.round(value)}</div>
    </div>
  )
}

// The six-factor scorecard used on cards and detail pages.
export function FactorGrid({ scores, compact }) {
  if (!scores) return null
  const rows = [
    ['Technical', scores.technical ?? scores.technical_score],
    ['Fundamental', scores.fundamental ?? scores.fundamental_score],
    ['Growth', scores.growth ?? scores.growth_score],
    ['Value', scores.value ?? scores.value_score],
    ['Quality', scores.quality ?? scores.quality_score],
    ['Risk', scores.risk ?? scores.risk_score],
  ]
  return (
    <div style={{ display: 'grid', gap: compact ? 6 : 9 }}>
      {rows.map(([label, v]) => <ScoreBar key={label} label={label} value={v} />)}
    </div>
  )
}

export function StatTile({ label, value, sub, color }) {
  return (
    <div style={{ ...glassInner, padding: '13px 15px' }}>
      <div style={{ fontFamily: C.mono, fontSize: 9.5, color: C.muted2, textTransform: 'uppercase',
        letterSpacing: 1, marginBottom: 7 }}>{label}</div>
      <div className="tnum" style={{ fontFamily: C.mono, fontSize: 18, fontWeight: 700,
        color: color || '#f4f5f7', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontFamily: C.mono, fontSize: 10, color: C.muted2, marginTop: 5 }}>{sub}</div>}
    </div>
  )
}

export function Section({ title, right, children, style }) {
  return (
    <section style={{ ...glass, padding: 24, ...style }}>
      {title && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontFamily: C.mono, fontSize: 11, color: C.accent, textTransform: 'uppercase',
            letterSpacing: 2, fontWeight: 600 }}>{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  )
}

export function ScoreRing({ value, size = 84 }) {
  const v = value == null ? 0 : Math.max(0, Math.min(100, value))
  const color = scoreColor(value)
  const r = size / 2 - 7
  const circ = 2 * Math.PI * r
  const dash = (v / 100) * circ
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', filter: `drop-shadow(0 0 6px ${color}55)` }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="6"
          strokeLinecap="round" strokeDasharray={`${dash} ${circ}`}
          style={{ transition: 'stroke-dasharray 0.6s cubic-bezier(0.16,1,0.3,1)' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center' }}>
        <span className="tnum" style={{ fontFamily: C.mono, fontSize: size > 70 ? 22 : 16, fontWeight: 700, color }}>
          {value == null ? '—' : fmtNum(value, 0)}
        </span>
        <span style={{ fontFamily: C.mono, fontSize: 8, color: C.muted2, letterSpacing: 1 }}>SCORE</span>
      </div>
    </div>
  )
}
