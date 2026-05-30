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
  if (!fcf || !wacc || wacc <= terminalGrowth) return null

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
