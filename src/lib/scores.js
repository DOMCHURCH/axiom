// ─────────────────────────────────────────────────────────────
// Institutional financial-health scores, computed purely from
// SEC EDGAR data. No external dependencies.
// ─────────────────────────────────────────────────────────────

// Altman Z-Score — bankruptcy / distress predictor.
// Classic model for public manufacturers:
//   Z = 1.2·X1 + 1.4·X2 + 3.3·X3 + 0.6·X4 + 1.0·X5
//   X1 = Working Capital / Total Assets
//   X2 = Retained Earnings / Total Assets
//   X3 = EBIT / Total Assets
//   X4 = Market Cap / Total Liabilities
//   X5 = Revenue / Total Assets
// Zones: > 2.99 safe · 1.81–2.99 grey · < 1.81 distress
export function altmanZScore(fin) {
  const { workingCapital, retainedEarnings, ebit, marketCap, totalLiabilities, revenue, totalAssets } = fin
  if (!totalAssets || !totalLiabilities) return null
  if (workingCapital == null || retainedEarnings == null || ebit == null || revenue == null) return null
  if (marketCap == null) return null

  const x1 = workingCapital / totalAssets
  const x2 = retainedEarnings / totalAssets
  const x3 = ebit / totalAssets
  // Cap X4: asset-light mega-caps (tiny liabilities, huge market cap) push this
  // ratio to absurd levels that dominate and distort the score. Winsorize at 20x
  // (≈ contribution of 12 to Z) — a common practitioner adjustment.
  const x4 = Math.min(marketCap / totalLiabilities, 20)
  const x5 = revenue / totalAssets

  const z = 1.2 * x1 + 1.4 * x2 + 3.3 * x3 + 0.6 * x4 + 1.0 * x5

  let zone, color
  if (z > 2.99) { zone = 'SAFE'; color = '#22c55e' }
  else if (z >= 1.81) { zone = 'GREY'; color = '#f59e0b' }
  else { zone = 'DISTRESS'; color = '#f87171' }

  return {
    score: z,
    zone,
    color,
    components: [
      { label: 'Working Capital / Assets', value: x1, weight: 1.2 },
      { label: 'Retained Earnings / Assets', value: x2, weight: 1.4 },
      { label: 'EBIT / Assets', value: x3, weight: 3.3 },
      { label: 'Market Cap / Liabilities', value: x4, weight: 0.6 },
      { label: 'Revenue / Assets', value: x5, weight: 1.0 },
    ],
  }
}

// Piotroski F-Score — 9-point fundamental quality screen.
// Each test scores 0 or 1; higher is stronger.
export function piotroskiFScore(fin) {
  const p = fin.prior || {}
  const tests = []

  const roa = fin.totalAssets && fin.netIncome != null ? fin.netIncome / fin.totalAssets : null
  const pRoa = p.totalAssets && p.netIncome != null ? p.netIncome / p.totalAssets : null
  const assetTurnover = fin.totalAssets && fin.revenue ? fin.revenue / fin.totalAssets : null
  const ltDebtRatio = fin.totalAssets && fin.longTermDebt != null ? fin.longTermDebt / fin.totalAssets : null
  const pLtDebtRatio = p.totalAssets && p.longTermDebt != null ? p.longTermDebt / p.totalAssets : null

  // Profitability (4)
  tests.push({ label: 'Positive net income (ROA > 0)', pass: roa != null ? roa > 0 : null, group: 'Profitability' })
  tests.push({ label: 'Positive operating cash flow', pass: fin.operatingCF != null ? fin.operatingCF > 0 : null, group: 'Profitability' })
  tests.push({ label: 'ROA rising YoY', pass: roa != null && pRoa != null ? roa > pRoa : null, group: 'Profitability' })
  tests.push({ label: 'CFO exceeds net income (low accruals)', pass: fin.operatingCF != null && fin.netIncome != null ? fin.operatingCF > fin.netIncome : null, group: 'Profitability' })

  // Leverage / Liquidity (3)
  tests.push({ label: 'Lower leverage YoY', pass: ltDebtRatio != null && pLtDebtRatio != null ? ltDebtRatio < pLtDebtRatio : null, group: 'Leverage' })
  tests.push({ label: 'Higher current ratio YoY', pass: fin.currentRatio != null && p.currentRatio != null ? fin.currentRatio > p.currentRatio : null, group: 'Leverage' })
  tests.push({ label: 'No share dilution YoY', pass: fin.shares != null && p.shares != null ? fin.shares <= p.shares * 1.01 : null, group: 'Leverage' })

  // Operating efficiency (2)
  tests.push({ label: 'Gross margin expanding YoY', pass: fin.grossMargin != null && p.grossMargin != null ? fin.grossMargin > p.grossMargin : null, group: 'Efficiency' })
  tests.push({ label: 'Asset turnover rising YoY', pass: assetTurnover != null && p.assetTurnover != null ? assetTurnover > p.assetTurnover : null, group: 'Efficiency' })

  const scored = tests.filter(t => t.pass !== null)
  if (scored.length === 0) return null
  const score = scored.filter(t => t.pass).length
  const max = scored.length

  let rating, color
  const ratio = score / max
  if (ratio >= 0.78) { rating = 'STRONG'; color = '#22c55e' }
  else if (ratio >= 0.44) { rating = 'MODERATE'; color = '#f59e0b' }
  else { rating = 'WEAK'; color = '#f87171' }

  return { score, max, rating, color, tests }
}

// DuPont decomposition — explains *why* ROE is what it is.
//   ROE = Net Margin × Asset Turnover × Equity Multiplier
export function dupontROE(fin) {
  const netMargin = fin.revenue && fin.netIncome != null ? fin.netIncome / fin.revenue : null
  const assetTurnover = fin.totalAssets && fin.revenue ? fin.revenue / fin.totalAssets : null
  const equityMultiplier = fin.totalEquity && fin.totalAssets ? fin.totalAssets / fin.totalEquity : null
  if (netMargin == null || assetTurnover == null || equityMultiplier == null) return null

  const roe = netMargin * assetTurnover * equityMultiplier
  return {
    roe,
    netMargin,
    assetTurnover,
    equityMultiplier,
    components: [
      { label: 'Net Margin', value: netMargin, fmt: 'pct', hint: 'Profitability' },
      { label: 'Asset Turnover', value: assetTurnover, fmt: 'x', hint: 'Efficiency' },
      { label: 'Equity Multiplier', value: equityMultiplier, fmt: 'x', hint: 'Leverage' },
    ],
  }
}
