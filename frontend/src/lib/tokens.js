// ─────────────────────────────────────────────────────────────────────────────
// AXIOM design tokens — single source of truth for the visual system.
//
// Three coordinated surfaces share these tokens so the palette can no longer
// drift between files:
//   • palette — the product/app shell (navy + cyan).  App, Account.
//   • report  — the research-report surface (navy, recessed inner cards).
//   • brand   — the marketing/landing identity (violet→blue→cyan gradient).
//
// Type families are shared across all three.
// ─────────────────────────────────────────────────────────────────────────────

export const mono = "'IBM Plex Mono', 'Courier New', monospace"
export const sans = "'Inter', system-ui, -apple-system, sans-serif"

// Spacing scale (px) — 4pt base. Use for gaps/padding to keep rhythm consistent.
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 }

// Border-radius scale.
export const radius = { sm: 6, md: 8, lg: 12, xl: 16, xxl: 20, pill: 999 }

// Elevation — layered, low-spread shadows (institutional, not glowy).
export const elevation = {
  sm: '0 1px 2px rgba(0,0,0,0.4)',
  md: '0 4px 16px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.4)',
  lg: '0 16px 48px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.4)',
}

// Motion — shared easing + durations so interactions feel like one product.
export const ease = 'cubic-bezier(0.16,1,0.3,1)'
export const easeOut = 'cubic-bezier(0.4,0,0.2,1)'
export const motion = { fast: '0.15s', base: '0.2s', slow: '0.4s' }

// ── Product / app-shell palette (App.jsx, Account.jsx) ──
export const palette = {
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
  mono,
  sans,
}

// ── Research-report surface (ResearchReport.jsx, charts.jsx) ──
export const report = {
  bg:        '#070b1a',   // inner / recessed surface (metric cards)
  panel:     '#0d1228',   // primary panel
  panel2:    '#101630',   // raised panel
  border:    '#1a2744',
  border2:   '#243358',
  accent:    '#38bdf8',
  accentDim: '#38bdf812',
  positive:  '#22c55e',
  negative:  '#f87171',
  warning:   '#f59e0b',
  muted:     '#475569',
  muted2:    '#64748b',
  mono,
  sans,
  shadowSm:  elevation.sm,
  shadow:    elevation.md,
  shadowLg:  elevation.lg,
}

// ── Marketing / landing identity (Landing.jsx) ──
export const brand = {
  bg:         '#04040a',
  bg2:        '#07071200',
  panel:      'rgba(255,255,255,0.03)',
  panelSolid: '#0c0c1a',
  border:     'rgba(255,255,255,0.07)',
  border2:    'rgba(255,255,255,0.12)',
  violet:     '#7c3aed',
  blue:       '#2563eb',
  cyan:       '#06b6d4',
  green:      '#10b981',
  red:        '#ef4444',
  gold:       '#f59e0b',
  text:       '#ffffff',
  text2:      '#94a3b8',
  text3:      '#475569',
  mono,
  sans,
  grad:       'linear-gradient(135deg, #7c3aed, #2563eb, #06b6d4)',
  gradHover:  'linear-gradient(135deg, #6d28d9, #1d4ed8, #0891b2)',
}
