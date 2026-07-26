export function fmt(n, decimals = 1) {
  if (n == null || isNaN(n)) return 'N/A'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e12) return sign + (abs / 1e12).toFixed(decimals) + 'T'
  if (abs >= 1e9) return sign + (abs / 1e9).toFixed(decimals) + 'B'
  if (abs >= 1e6) return sign + (abs / 1e6).toFixed(decimals) + 'M'
  if (abs >= 1e3) return sign + (abs / 1e3).toFixed(decimals) + 'K'
  return sign + abs.toFixed(decimals)
}

export function fmtDollar(n, decimals = 1) {
  if (n == null || isNaN(n)) return 'N/A'
  return '$' + fmt(n, decimals)
}

export function pct(n, decimals = 1) {
  if (n == null || isNaN(n)) return 'N/A'
  return (n >= 0 ? '' : '') + (n * 100).toFixed(decimals) + '%'
}

export function pctSigned(n, decimals = 1) {
  if (n == null || isNaN(n)) return 'N/A'
  return (n >= 0 ? '+' : '') + (n * 100).toFixed(decimals) + '%'
}

export function fmtMultiple(n, decimals = 1) {
  if (n == null || isNaN(n)) return 'N/A'
  return n.toFixed(decimals) + 'x'
}

export function runDCF({ fcf, nearTermGrowth, longTermGrowth, terminalGrowth, wacc, shares, netDebt, nearTermYears = 3, totalYears = 8 }) {
  // A constant-growth DCF is only meaningful for positive starting FCF — a
  // negative base would compound into a negative "intrinsic value" that is
  // nonsense to display. Skip it (the report shows a thin-data/loss note instead).
  if (!fcf || fcf <= 0 || !wacc || wacc <= terminalGrowth) return null

  const projectedFCF = []
  let cf = fcf
  for (let i = 1; i <= totalYears; i++) {
    const g = i <= nearTermYears ? nearTermGrowth : longTermGrowth
    cf = cf * (1 + g)
    projectedFCF.push(cf)
  }

  const pvFCF = projectedFCF.reduce((sum, flow, i) => {
    return sum + flow / Math.pow(1 + wacc, i + 1)
  }, 0)

  const lastFCF = projectedFCF[totalYears - 1]
  const terminalValue = lastFCF * (1 + terminalGrowth) / (wacc - terminalGrowth)
  const pvTerminal = terminalValue / Math.pow(1 + wacc, totalYears)

  const enterpriseValue = pvFCF + pvTerminal
  const equityValue = enterpriseValue - (netDebt || 0)
  const intrinsicValue = shares > 0 ? equityValue / shares : null

  return {
    projectedFCF,
    pvFCF,
    terminalValue,
    pvTerminal,
    enterpriseValue,
    equityValue,
    intrinsicValue,
    tvAsPctOfEV: pvTerminal / enterpriseValue,
  }
}

// Monte Carlo DCF — runs N simulations drawing WACC, growth, and
// terminal growth from normal distributions around the base case.
// Returns the distribution of intrinsic value per share plus
// percentiles and the probability of upside vs. current price.
export function monteCarloDCF({ fcf, nearTermGrowth, longTermGrowth, terminalGrowth, wacc, shares, netDebt }, currentPrice, runs = 2000) {
  if (!fcf || !shares) return null

  // Box-Muller transform for standard normal draws
  const randn = () => {
    let u = 0, v = 0
    while (u === 0) u = Math.random()
    while (v === 0) v = Math.random()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }

  const values = []
  for (let i = 0; i < runs; i++) {
    const w = wacc + randn() * 0.015          // ±1.5% WACC sigma
    const ntg = nearTermGrowth + randn() * 0.03 // ±3% near-term growth sigma
    const ltg = longTermGrowth + randn() * 0.02
    const tg = Math.min(terminalGrowth + randn() * 0.005, w - 0.005) // keep tg < wacc
    const res = runDCF({ fcf, nearTermGrowth: ntg, longTermGrowth: ltg, terminalGrowth: tg, wacc: w, shares, netDebt })
    if (res?.intrinsicValue != null && isFinite(res.intrinsicValue) && res.intrinsicValue > 0) {
      values.push(res.intrinsicValue)
    }
  }
  if (values.length < runs * 0.5) return null
  values.sort((a, b) => a - b)

  const percentile = q => values[Math.floor(q * (values.length - 1))]
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  const probUpside = currentPrice ? values.filter(v => v > currentPrice).length / values.length : null

  // Build a histogram (24 bins) for plotting
  const min = values[0], max = values[values.length - 1]
  const bins = 24
  const width = (max - min) / bins || 1
  const histogram = Array.from({ length: bins }, (_, i) => ({ x: min + i * width, count: 0 }))
  for (const v of values) {
    const idx = Math.min(Math.floor((v - min) / width), bins - 1)
    histogram[idx].count++
  }

  return {
    runs: values.length,
    mean,
    median: percentile(0.5),
    p10: percentile(0.1),
    p25: percentile(0.25),
    p75: percentile(0.75),
    p90: percentile(0.9),
    min,
    max,
    probUpside,
    histogram,
  }
}

// Returns a 3x3 sensitivity grid varying WACC and terminal growth
export function dcfSensitivity({ fcf, nearTermGrowth, longTermGrowth, terminalGrowth, wacc, shares, netDebt }) {
  const waccOffsets = [-0.01, 0, 0.01]
  const tgOffsets = [-0.005, 0, 0.005]

  return {
    waccLabels: waccOffsets.map(d => pct(wacc + d)),
    tgLabels: tgOffsets.map(d => pct(terminalGrowth + d)),
    grid: waccOffsets.map(wd =>
      tgOffsets.map(tgd => {
        const res = runDCF({
          fcf,
          nearTermGrowth,
          longTermGrowth,
          terminalGrowth: terminalGrowth + tgd,
          wacc: wacc + wd,
          shares,
          netDebt,
        })
        return res?.intrinsicValue ?? null
      })
    ),
  }
}
