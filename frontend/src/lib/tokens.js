// ─────────────────────────────────────────────────────────────────────────────
// AXIOM design system — premium glassmorphism.
// Dark charcoal base, layered frosted-glass panels with backdrop blur, soft
// borders + inner highlights, restrained warm-amber accent. One source of truth.
// ─────────────────────────────────────────────────────────────────────────────

export const mono = "'IBM Plex Mono', 'Courier New', monospace"
export const sans = "'Inter', system-ui, -apple-system, sans-serif"

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 }
export const radius = { sm: 8, md: 12, lg: 16, xl: 20, xxl: 26, pill: 999 }

// ── Core palette ──
export const palette = {
  // charcoal base + subtle elevation steps
  bg:       '#0c0d10',
  bg2:      '#0e0f13',
  bg3:      '#131419',
  // frosted glass surfaces (semi-transparent, meant for backdrop-blur)
  glass:    'rgba(255,255,255,0.045)',
  glassHov: 'rgba(255,255,255,0.07)',
  glass2:   'rgba(255,255,255,0.028)',   // recessed inner cards
  panel:    'rgba(255,255,255,0.045)',
  panelHov: 'rgba(255,255,255,0.075)',
  // hairline borders + highlights
  border:   'rgba(255,255,255,0.08)',
  border2:  'rgba(255,255,255,0.14)',
  highlight:'rgba(255,255,255,0.06)',    // inset top edge
  // warm amber accent (restrained)
  accent:   '#f5a524',
  accentHi: '#ffc25a',
  accentLo: 'rgba(245,165,36,0.10)',
  accentBd: 'rgba(245,165,36,0.32)',
  accentMid:'rgba(245,165,36,0.55)',
  accentGlow:'rgba(245,165,36,0.28)',
  // semantic
  green:    '#4ade80',
  greenLo:  'rgba(74,222,128,0.12)',
  greenBd:  'rgba(74,222,128,0.30)',
  red:      '#f87171',
  redLo:    'rgba(248,113,113,0.12)',
  redBd:    'rgba(248,113,113,0.30)',
  gold:     '#f5a524',
  // text
  text:     '#f4f5f7',
  text2:    '#b6bac4',
  text3:    '#8a8f9c',
  muted:    '#6b7280',
  muted2:   '#9aa0ad',
  mono,
  sans,
}

// ── Report surface (shares the glass system) ──
export const report = {
  bg:        'rgba(255,255,255,0.028)',  // recessed inner
  panel:     'rgba(255,255,255,0.045)',
  panel2:    'rgba(255,255,255,0.07)',
  border:    'rgba(255,255,255,0.08)',
  border2:   'rgba(255,255,255,0.14)',
  accent:    '#f5a524',
  accentDim: 'rgba(245,165,36,0.10)',
  positive:  '#4ade80',
  negative:  '#f87171',
  warning:   '#f5a524',
  muted:     '#6b7280',
  muted2:    '#9aa0ad',
  mono,
  sans,
  shadowSm:  '0 1px 2px rgba(0,0,0,0.4)',
  shadow:    '0 8px 28px rgba(0,0,0,0.38)',
  shadowLg:  '0 20px 60px rgba(0,0,0,0.5)',
}

// ── Glass panel style helpers (spread into inline style) ──
export const glass = {
  background: palette.glass,
  backdropFilter: 'blur(22px) saturate(150%)',
  WebkitBackdropFilter: 'blur(22px) saturate(150%)',
  border: `1px solid ${palette.border}`,
  borderRadius: radius.xl,
  boxShadow: '0 10px 34px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.07)',
}
export const glassInner = {
  background: palette.glass2,
  border: `1px solid ${palette.border}`,
  borderRadius: radius.lg,
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.045)',
}

// Ambient background — soft accent glow blobs behind the frosted glass.
export const ambientBg =
  `radial-gradient(1100px 620px at 12% -8%, rgba(245,165,36,0.10), transparent 60%),` +
  `radial-gradient(900px 560px at 100% 0%, rgba(120,140,255,0.06), transparent 55%),` +
  `radial-gradient(800px 800px at 50% 120%, rgba(245,165,36,0.05), transparent 60%),` +
  `#0c0d10`

export const brand = { ...palette, grad: 'linear-gradient(135deg,#f5a524,#ffc25a)' }
