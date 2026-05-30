export function fmt(n, decimals = 1) {
  if (n == null || isNaN(n)) return 'N/A'
  if (Math.abs(n) >= 1e12) return (n / 1e12).toFixed(decimals) + 'T'
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(decimals) + 'B'
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(decimals) + 'M'
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(decimals) + 'K'
  return n.toFixed(decimals)
}

export function pct(n, decimals = 1) {
  if (n == null || isNaN(n)) return 'N/A'
  return (n * 100).toFixed(decimals) + '%'
}

export function fmtMultiple(n, decimals = 1) {
  if (n == null || isNaN(n)) return 'N/A'
  return n.toFixed(decimals) + 'x'
}

export function runDCF({ fcf, growthRate, terminalGrowth, wacc, shares, netDebt, years = 5 }) {
  if (!fcf || !wacc || wacc <= terminalGrowth) return null

  const projectedFCF = []
  let cf = fcf
  for (let i = 1; i <= years; i++) {
    cf = cf * (1 + growthRate)
    projectedFCF.push(cf)
  }

  const pvFCF = projectedFCF.reduce((sum, flow, i) => {
    return sum + flow / Math.pow(1 + wacc, i + 1)
  }, 0)

  const terminalValue = projectedFCF[years - 1] * (1 + terminalGrowth) / (wacc - terminalGrowth)
  const pvTerminal = terminalValue / Math.pow(1 + wacc, years)

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
  }
}
