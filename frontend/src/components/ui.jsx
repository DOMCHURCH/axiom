// Shared AXIOM UI primitives — recommendation badge, score bar, factor grid,
// stat tiles, section wrapper. All styled from the report token palette.
import { report as C } from '../lib/tokens.js'
import { REC_COLOR, scoreColor, fmtNum } from '../lib/api.js'

export function RecBadge({ rec, size = 'md' }) {
  if (!rec) return null
  const color = REC_COLOR[rec] || C.muted2
  const pad = size === 'lg' ? '6px 14px' : size === 'sm' ? '2px 8px' : '4px 11px'
  const fs = size === 'lg' ? 13 : size === 'sm' ? 9 : 11
  return (
    <span style={{
      fontFamily: C.mono, fontSize: fs, fontWeight: 700, color,
      background: color + '18', border: `1px solid ${color}40`, borderRadius: 6,
      padding: pad, letterSpacing: 0.6, whiteSpace: 'nowrap',
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
      <div style={{ flex: 1, height: 6, background: C.bg, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3,
          transition: 'width 0.4s cubic-bezier(0.16,1,0.3,1)' }} />
      </div>
      <div className="tnum" style={{ fontFamily: C.mono, fontSize: 11, color: value == null ? C.muted : '#e8eef7',
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
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: '13px 15px' }}>
      <div style={{ fontFamily: C.mono, fontSize: 9.5, color: C.muted2, textTransform: 'uppercase',
        letterSpacing: 1, marginBottom: 7 }}>{label}</div>
      <div className="tnum" style={{ fontFamily: C.mono, fontSize: 18, fontWeight: 700,
        color: color || '#f0f6ff', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontFamily: C.mono, fontSize: 10, color: C.muted2, marginTop: 5 }}>{sub}</div>}
    </div>
  )
}

export function Section({ title, right, children, style }) {
  return (
    <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14,
      padding: 22, ...style }}>
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
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.border} strokeWidth="6" />
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
