// Pure-SVG chart primitives — no external charting library.
const C = {
  accent: '#38bdf8', positive: '#22c55e', negative: '#f87171',
  warning: '#f59e0b', muted: '#4b5563', muted2: '#6b7280',
  border: '#1e1e1e', bg: '#0a0a0a',
  mono: "'IBM Plex Mono', monospace",
}

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
  const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ')
  const rising = clean[clean.length - 1] >= clean[0]
  const lineColor = color === 'auto' ? (rising ? C.positive : C.negative) : color
  const last = pts[pts.length - 1]

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <path d={path} fill="none" stroke={lineColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2" fill={lineColor} />
    </svg>
  )
}

// ── Football Field: horizontal valuation-range bars ──
// `methods` = [{ label, low, high, mid }], `current` = current price
export function FootballField({ methods, current, target }) {
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
          return (
            <g key={i}>
              <rect x={x1} y={y - 7} width={Math.max(x2 - x1, 0.5)} height="14" rx="1.5"
                fill={m.color || C.accent} opacity="0.28" />
              <rect x={x1} y={y - 7} width="0.4" height="14" fill={m.color || C.accent} vectorEffect="non-scaling-stroke" />
              <rect x={x2} y={y - 7} width="0.4" height="14" fill={m.color || C.accent} vectorEffect="non-scaling-stroke" />
              {m.mid != null && (
                <circle cx={scale(m.mid)} cy={y} r="1" fill={m.color || C.accent} vectorEffect="non-scaling-stroke" />
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
                fontFamily: C.mono, fontSize: 11, color: '#9ca3af' }}>
                {m.label}
              </div>
              <div style={{ position: 'absolute', left: 0, top: y + 1, width: labelW,
                fontFamily: C.mono, fontSize: 10, color: C.muted }}>
                ${m.low.toFixed(0)} – ${m.high.toFixed(0)}
              </div>
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
  if (!histogram || histogram.length === 0) return null
  const maxCount = Math.max(...histogram.map(b => b.count)) || 1

  // Use P10/P90 as display range to hide extreme tails; fall back to full range
  const displayMin = p10 ?? histogram[0].x
  const displayMax = p90 ?? histogram[histogram.length - 1].x
  const range = displayMax - displayMin || 1
  const scaleX = v => Math.max(0, Math.min(100, ((v - displayMin) / range) * 100))

  // Only render bins that fall within the display range
  const visible = histogram.filter(b => b.x + (histogram[1]?.x - histogram[0]?.x || 0) >= displayMin && b.x <= displayMax)

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1.5, height, position: 'relative' }}>
        {visible.map((b, i) => {
          const aboveCurrent = current != null && b.x >= current
          return (
            <div key={i} style={{
              flex: 1,
              height: `${(b.count / maxCount) * 100}%`,
              minHeight: b.count > 0 ? 2 : 0,
              background: aboveCurrent ? C.positive : C.negative,
              opacity: 0.6,
              borderRadius: '1px 1px 0 0',
            }} />
          )
        })}
        {/* median marker */}
        {median != null && (
          <div style={{ position: 'absolute', left: `${scaleX(median)}%`, top: 0, bottom: 0,
            width: 1.5, background: C.accent }} />
        )}
        {/* current price marker */}
        {current != null && current >= displayMin && current <= displayMax && (
          <div style={{ position: 'absolute', left: `${scaleX(current)}%`, top: 0, bottom: 0,
            width: 1, background: '#ffffff55', borderLeft: '1px dashed #ffffff55' }} />
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6,
        fontFamily: C.mono, fontSize: 10, color: C.muted }}>
        <span>${displayMin.toFixed(0)}</span>
        <span>${displayMax.toFixed(0)}</span>
      </div>
    </div>
  )
}
