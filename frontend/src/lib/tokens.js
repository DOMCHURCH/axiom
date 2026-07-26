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
  // FROSTY WHITE glass surfaces. A directional white sheen (not a flat tint) is
  // what makes translucent panels read as *frosted glass* over the dark dithered
  // background — light at the top-left, thinning toward the bottom-right.
  glass:    'linear-gradient(148deg, rgba(255,255,255,0.185) 0%, rgba(255,255,255,0.095) 46%, rgba(255,255,255,0.06) 100%)',
  glassHov: 'linear-gradient(148deg, rgba(255,255,255,0.26) 0%, rgba(255,255,255,0.145) 46%, rgba(255,255,255,0.09) 100%)',
  glass2:   'rgba(255,255,255,0.075)',   // recessed inner cards
  shell:    'linear-gradient(160deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.045) 60%, rgba(255,255,255,0.03) 100%)',
  panel:    'linear-gradient(148deg, rgba(255,255,255,0.185) 0%, rgba(255,255,255,0.095) 46%, rgba(255,255,255,0.06) 100%)',
  panelHov: 'linear-gradient(148deg, rgba(255,255,255,0.26) 0%, rgba(255,255,255,0.145) 46%, rgba(255,255,255,0.09) 100%)',
  // hairline borders + highlights
  border:   'rgba(255,255,255,0.22)',
  border2:  'rgba(255,255,255,0.34)',
  highlight:'rgba(255,255,255,0.42)',    // inset top edge
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
  // text — lifted for contrast against the brighter frosted glass
  text:     '#ffffff',
  text2:    '#dfe3ea',
  text3:    '#b9bfcb',
  muted:    '#8e96a4',
  muted2:   '#b3bac6',
  mono,
  sans,
}

// ── Report surface (shares the frosty-white glass system) ──
export const report = {
  bg:        'rgba(255,255,255,0.055)',  // recessed inner
  panel:     'rgba(255,255,255,0.10)',
  panel2:    'rgba(255,255,255,0.16)',
  border:    'rgba(255,255,255,0.16)',
  border2:   'rgba(255,255,255,0.26)',
  text:      '#ffffff',
  accent:    '#f5a524',
  accentDim: 'rgba(245,165,36,0.12)',
  positive:  '#4ade80',
  negative:  '#f87171',
  warning:   '#f5a524',
  muted:     '#8e96a4',
  muted2:    '#b3bac6',
  mono,
  sans,
  shadowSm:  '0 1px 2px rgba(0,0,0,0.4)',
  shadow:    '0 8px 28px rgba(0,0,0,0.38)',
  shadowLg:  '0 20px 60px rgba(0,0,0,0.5)',
}

// ── Frosty-white glass helpers (spread into inline style) ──
export const glass = {
  background: palette.glass,
  backdropFilter: 'blur(28px) saturate(165%)',
  WebkitBackdropFilter: 'blur(28px) saturate(165%)',
  border: `1px solid ${palette.border}`,
  borderRadius: radius.xl,
  boxShadow: '0 14px 44px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.42), inset 0 -1px 0 rgba(255,255,255,0.06)',
}
export const glassInner = {
  background: palette.glass2,
  border: `1px solid rgba(255,255,255,0.16)`,
  borderRadius: radius.lg,
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.20)',
}
// The outer dashboard frame — inset from the viewport so it floats over the
// dithered WebGL background.
export const shellFrame = {
  background: palette.shell,
  backdropFilter: 'blur(20px) saturate(145%)',
  WebkitBackdropFilter: 'blur(20px) saturate(145%)',
  border: `1px solid ${palette.border}`,
  borderRadius: 26,
  boxShadow: '0 34px 100px rgba(0,0,0,0.58), inset 0 1px 0 rgba(255,255,255,0.34)',
}

// Fallback page background (the WebGL dither canvas renders on top of this).
export const ambientBg = '#0c0d10'

export const brand = { ...palette, grad: 'linear-gradient(135deg,#f5a524,#ffc25a)' }
