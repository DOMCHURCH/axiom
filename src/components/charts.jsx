// Pure-SVG chart primitives — no external charting library.
// Palette unified via the shared report tokens (deep-navy institutional system).
import { useState } from 'react'
import { report as C } from '../lib/tokens.js'

// Shared tooltip — absolutely positioned, GPU-composited, print-safe
// (only mounts on hover, which never fires during print).
function ChartTooltip({ x, children }) {
  return (
    <div className="no-print" style={{
      position: 'absolute', left: `${x}%`, bottom: '100%', transform: 'translate(-50%, -8px)',
      background: 'rgba(7,11,26,0.97)', border: `1px solid ${C.border2}`, borderRadius: 8,
      padding: '8px 11px', pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 20,
      boxShadow: C.shadowLg, backdropFilter: 'blur(4px)',
    }}>
      {children}
      <span style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
        width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
        borderTop: `5px solid ${C.border2}` }} />
    </div>
  )
}

let _gid = 0
const uid = () => `axg${++_gid}`

// ── Sparkline: inline trend line for a small series ──
// `data` is oldest→newest. Pass reversed EDGAR history.
export function Sparkline({ data, width = 120, height = 32, color = C.accent }) {
  const clean = (data || []).filter(v => v != null && isFinite(v))
  if (clean.length < 2) return <span style={{ color: C.muted, fontFamily: C.mono, fontSize: 11 }}>—</span>

  const min = Math.min(...clean)
  const max = Math.max(...clean)
  const range = max - min || 1
  const pad = 3
  const stepX = (width - pad * 2) / (clean.length - 1)
  const pts = clean.map((v, i) => {
    const x = pad + i * stepX
    const y = height - pad - ((v - min) / range) * (height - pad * 2)
    return [x, y]
  })
  const linePath = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ')
  const areaPath = `${linePath} L ${pts[pts.length - 1][0].toFixed(1)} ${height} L ${pts[0][0].toFixed(1)} ${height} Z`
  const rising = clean[clean.length - 1] >= clean[0]
  const lineColor = color === 'auto' ? (rising ? C.positive : C.negative) : color
  const last = pts[pts.length - 1]
  const gid = uid()

  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.22" />
          <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gid})`} stroke="none" />
      <path d={linePath} fill="none" stroke={lineColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.4" fill={lineColor} />
      <circle cx={last[0]} cy={last[1]} r="4" fill={lineColor} opacity="0.25" />
    </svg>
  )
}

// ── Football Field: horizontal valuation-range bars ──
// `methods` = [{ label, low, high, mid }], `current` = current price
export function FootballField({ methods, current, target }) {
  const [hover, setHover] = useState(null)
  const valid = (methods || []).filter(m => m.low != null && m.high != null && isFinite(m.low) && isFinite(m.high))
  if (valid.length === 0) return null

  const allVals = valid.flatMap(m => [m.low, m.high, m.mid].filter(v => v != null))
  if (current != null) allVals.push(current)
  if (target != null) allVals.push(target)
  let lo = Math.min(...allVals)
  let hi = Math.max(...allVals)
  const span = hi - lo || 1
  lo -= span * 0.08
  hi += span * 0.08
  const scale = v => ((v - lo) / (hi - lo)) * 100

  const rowH = 38
  const labelW = 150
  const chartH = valid.length * rowH + 36

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg width="100%" height={chartH} style={{ overflow: 'visible' }} viewBox={`0 0 100 ${chartH}`} preserveAspectRatio="none">
        {/* current price reference line */}
        {current != null && (
          <line x1={scale(current)} y1="0" x2={scale(current)} y2={valid.length * rowH}
            stroke={C.muted2} strokeWidth="0.3" strokeDasharray="1.5 1.5" vectorEffect="non-scaling-stroke" />
        )}
        {/* target price reference line */}
        {target != null && (
          <line x1={scale(target)} y1="0" x2={scale(target)} y2={valid.length * rowH}
            stroke={C.accent} strokeWidth="0.4" strokeDasharray="2 1.5" vectorEffect="non-scaling-stroke" />
        )}
        {valid.map((m, i) => {
          const y = i * rowH + rowH / 2
          const x1 = scale(m.low), x2 = scale(m.high)
          const active = hover === i
          return (
            <g key={i}>
              <rect x={x1} y={y - 7} width={Math.max(x2 - x1, 0.5)} height="14" rx="1.5"
                fill={m.color || C.accent} opacity={active ? 0.45 : 0.28} style={{ transition: 'opacity 0.12s' }} />
              <rect x={x1} y={y - 7} width="0.4" height="14" fill={m.color || C.accent} vectorEffect="non-scaling-stroke" />
              <rect x={x2} y={y - 7} width="0.4" height="14" fill={m.color || C.accent} vectorEffect="non-scaling-stroke" />
              {m.mid != null && (
                <circle cx={scale(m.mid)} cy={y} r={active ? 1.6 : 1} fill={m.color || C.accent} vectorEffect="non-scaling-stroke" />
              )}
            </g>
          )
        })}
      </svg>

      {/* Overlay labels & values (HTML, not scaled) */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {valid.map((m, i) => {
          const y = i * rowH + rowH / 2
          return (
            <div key={i}>
              <div style={{ position: 'absolute', left: 0, top: y - 16, width: labelW,
                fontFamily: C.mono, fontSize: 11, color: hover === i ? '#e8eef7' : '#9ca3af', transition: 'color 0.12s' }}>
                {m.label}
              </div>
              <div className="tnum" style={{ position: 'absolute', left: 0, top: y + 1, width: labelW,
                fontFamily: C.mono, fontSize: 10, color: C.muted }}>
                ${m.low.toFixed(0)} – ${m.high.toFixed(0)}
              </div>
            </div>
          )
        })}
        {/* Per-row hover hitboxes + midpoint tooltip */}
        {valid.map((m, i) => {
          const top = i * rowH
          return (
            <div key={`hz${i}`}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              style={{ position: 'absolute', left: 0, right: 0, top, height: rowH, pointerEvents: 'auto', cursor: 'default' }}>
              {hover === i && m.mid != null && (
                <ChartTooltip x={Math.max(8, Math.min(92, scale(m.mid)))}>
                  <div style={{ fontFamily: C.mono, fontSize: 11, color: m.color || C.accent, fontWeight: 600 }}>{m.label}</div>
                  <div className="tnum" style={{ fontFamily: C.mono, fontSize: 11, color: '#e8eef7', marginTop: 3 }}>
                    Mid ${m.mid.toFixed(0)} <span style={{ color: C.muted2 }}>· ${m.low.toFixed(0)}–${m.high.toFixed(0)}</span>
                  </div>
                </ChartTooltip>
              )}
            </div>
          )
        })}
        {current != null && (
          <div style={{ position: 'absolute', left: `${scale(current)}%`, top: valid.length * rowH + 4,
            transform: 'translateX(-50%)', fontFamily: C.mono, fontSize: 10, color: C.muted2, whiteSpace: 'nowrap' }}>
            Current ${current.toFixed(0)}
          </div>
        )}
        {target != null && (
          <div style={{ position: 'absolute', left: `${scale(target)}%`, top: valid.length * rowH + 18,
            transform: 'translateX(-50%)', fontFamily: C.mono, fontSize: 10, color: C.accent, whiteSpace: 'nowrap' }}>
            Target ${target.toFixed(0)}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Score Gauge: arc gauge for Z-Score / F-Score ──
export function ScoreGauge({ value, max, color, label, sublabel }) {
  const pct = Math.max(0, Math.min(value / max, 1))
  const r = 42, cx = 55, cy = 52
  const circ = Math.PI * r // semicircle
  const dash = pct * circ

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width="110" height="64">
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke={C.border} strokeWidth="7" strokeLinecap="round" />
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`} />
        <text x={cx} y={cy - 6} textAnchor="middle" fill="#fff"
          style={{ fontFamily: C.mono, fontSize: 20, fontWeight: 700 }}>
          {typeof value === 'number' ? value.toFixed(value < 10 ? 1 : 0) : value}
        </text>
      </svg>
      <div style={{ fontFamily: C.mono, fontSize: 11, color, fontWeight: 700, letterSpacing: 0.5, marginTop: -2 }}>{label}</div>
      {sublabel && <div style={{ fontFamily: C.mono, fontSize: 9, color: C.muted, marginTop: 2 }}>{sublabel}</div>}
    </div>
  )
}

// ── Histogram: Monte Carlo distribution ──
export function Histogram({ histogram, current, median, p10, p90, height = 90 }) {
  const [hover, setHover] = useState(null)
  if (!histogram || histogram.length === 0) return null
  const maxCount = Math.max(...histogram.map(b => b.count)) || 1
  const totalCount = histogram.reduce((s, b) => s + b.count, 0) || 1
  const binW = (histogram[1]?.x - histogram[0]?.x) || 0

  // Use P10/P90 as display range to hide extreme tails; fall back to full range
  const displayMin = p10 ?? histogram[0].x
  const displayMax = p90 ?? histogram[histogram.length - 1].x
  const range = displayMax - displayMin || 1
  const scaleX = v => Math.max(0, Math.min(100, ((v - displayMin) / range) * 100))

  // Only render bins that fall within the display range
  const visible = histogram.filter(b => b.x + (histogram[1]?.x - histogram[0]?.x || 0) >= displayMin && b.x <= displayMax)

  return (
    <div style={{ width: '100%' }}>
      <div style={{ position: 'relative', height, paddingBottom: 0 }}>
        {/* Horizontal gridlines (25/50/75%) behind the bars */}
        {[0.25, 0.5, 0.75].map(g => (
          <div key={g} style={{ position: 'absolute', left: 0, right: 0, bottom: `${g * 100}%`,
            height: 1, background: C.border, opacity: 0.6 }} />
        ))}
        {/* Baseline */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 1, background: C.border2 }} />
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1.5, height, position: 'relative' }}
          onMouseLeave={() => setHover(null)}>
          {visible.map((b, i) => {
            const aboveCurrent = current != null && b.x >= current
            const col = aboveCurrent ? C.positive : C.negative
            const active = hover === i
            return (
              <div key={i}
                onMouseEnter={() => setHover(i)}
                style={{
                  flex: 1,
                  height: `${(b.count / maxCount) * 100}%`,
                  minHeight: b.count > 0 ? 2 : 0,
                  background: `linear-gradient(180deg, ${col} 0%, ${col}88 100%)`,
                  opacity: active ? 1 : 0.72,
                  borderRadius: '2px 2px 0 0',
                  transition: 'opacity 0.12s',
                  cursor: 'default',
                }} />
            )
          })}
          {/* Premium tooltip */}
          {hover != null && visible[hover] && (
            <ChartTooltip x={((hover + 0.5) / visible.length) * 100}>
              <div className="tnum" style={{ fontFamily: C.mono, fontSize: 12, color: '#e8eef7', fontWeight: 600 }}>
                ${visible[hover].x.toFixed(0)} – ${(visible[hover].x + binW).toFixed(0)}
              </div>
              <div className="tnum" style={{ fontFamily: C.mono, fontSize: 10, color: C.muted2, marginTop: 2 }}>
                {visible[hover].count.toLocaleString()} trials · {((visible[hover].count / totalCount) * 100).toFixed(1)}%
              </div>
            </ChartTooltip>
          )}
          {/* median marker */}
          {median != null && (
            <div style={{ position: 'absolute', left: `${scaleX(median)}%`, top: -2, bottom: 0,
              width: 1.5, background: C.accent, boxShadow: `0 0 6px ${C.accent}` }} />
          )}
          {/* current price marker */}
          {current != null && current >= displayMin && current <= displayMax && (
            <div style={{ position: 'absolute', left: `${scaleX(current)}%`, top: 0, bottom: 0,
              width: 0, borderLeft: '1px dashed #ffffff66' }} />
          )}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7,
        fontFamily: C.mono, fontSize: 10, color: C.muted }} className="tnum">
        <span>${displayMin.toFixed(0)}</span>
        <span style={{ color: C.muted2 }}>P10 – P90 intrinsic value / share</span>
        <span>${displayMax.toFixed(0)}</span>
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
        {[['Median', C.accent], ['Above price', C.positive], ['Below price', C.negative]].map(([lab, col]) => (
          <div key={lab} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: col, opacity: 0.8 }} />
            <span style={{ fontFamily: C.mono, fontSize: 10, color: C.muted2 }}>{lab}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
