const SYSTEM = `You are a senior equity research analyst. Be precise, data-driven, and take clear stances. Use the financial data provided.`

export async function generateResearch({ ticker, financials, apiKey, provider, model, onProgress }) {
  const fin = financials
  const t = ticker.toUpperCase()

  const dataBlock = [
    `${fin.companyName} (${t})`,
    `Rev: ${dollar(fin.revenue)} (${pct(fin.revenueGrowth)} YoY) | GP Margin: ${pct(fin.grossMargin)} | EBITDA Margin: ${pct(fin.ebitdaMargin)} | Net Margin: ${pct(fin.netMargin)}`,
    `EBIT: ${dollar(fin.ebit)} | FCF: ${dollar(fin.fcf)} (${pct(fin.fcfMargin)} margin) | OpCF: ${dollar(fin.operatingCF)} | CapEx: ${dollar(fin.capex)}`,
    `Cash: ${dollar(fin.cash)} | Debt: ${dollar(fin.totalDebt)} | Net Debt: ${dollar(fin.netDebt)} | Equity: ${dollar(fin.totalEquity)}`,
    `ROE: ${pct(fin.roe)} | ROA: ${pct(fin.roa)} | D/E: ${fin.debtToEquity != null ? fin.debtToEquity.toFixed(2) + 'x' : 'N/A'} | Int. Coverage: ${fin.interestCoverage != null ? fin.interestCoverage.toFixed(1) + 'x' : 'N/A'}`,
    `EPS: ${fin.eps != null ? '$' + fin.eps.toFixed(2) : 'N/A'} | Shares: ${fin.shares != null ? (fin.shares / 1e6).toFixed(0) + 'M' : 'N/A'} | Current Ratio: ${fin.currentRatio != null ? fin.currentRatio.toFixed(2) + 'x' : 'N/A'}`,
  ].join('\n')

  const pass1Prompt = `Analyze ${t} for institutional investors using this SEC EDGAR data:
${dataBlock}

Cover: (1) business model & moat, (2) revenue/margin/FCF quality, (3) balance sheet, (4) valuation with DCF assumptions (WACC, growth rates, terminal growth), (5) 3 bull points with numbers, (6) 3 bear points with numbers, (7) 4-5 risks rated HIGH/MEDIUM/LOW, (8) BUY/HOLD/SELL with 12-month price target and upside %. Be concise and specific.`

  onProgress?.('Pass 1/2 — analyst reasoning...')
  const reasoning = await callAI({ systemPrompt: SYSTEM, prompt: pass1Prompt, apiKey, provider, model })

  const pass2Prompt = `From this analysis of ${t}:
${reasoning}

Output ONLY valid JSON, no markdown:
{"recommendation":"BUY"|"HOLD"|"SELL","targetPrice":number|null,"currentPrice":number|null,"upside":number|null,"companyDescription":"string","executiveSummary":"string","moatRating":"WIDE"|"NARROW"|"NONE","investmentThesis":"string","bullCase":["string","string","string"],"bearCase":["string","string","string"],"catalysts":["string","string"],"dcfAssumptions":{"nearTermGrowth":number,"longTermGrowth":number,"terminalGrowthRate":number,"wacc":number,"ebitdaMargin":number,"fcfConversionRate":number},"comps":[{"ticker":"string","name":"string","evEbitda":number|null,"peRatio":number|null,"revenueGrowth":number|null,"grossMargin":number|null}],"risks":[{"title":"string","description":"string","severity":"HIGH"|"MEDIUM"|"LOW","category":"FINANCIAL"|"OPERATIONAL"|"REGULATORY"|"COMPETITIVE"|"MACRO"}],"tradingMultiples":{"evRevenue":number|null,"evEbitda":number|null,"peRatio":number|null,"fcfYield":number|null},"financialHighlights":{"revenueGrowthComment":"string","marginComment":"string","balanceSheetComment":"string","fcfComment":"string"},"analystNote":"string"}`

  onProgress?.('Pass 2/2 — structuring output...')
  const raw = await callAI({ systemPrompt: SYSTEM, prompt: pass2Prompt, apiKey, provider, model })

  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI returned unparseable output. Try again.')
  let structured
  try {
    structured = JSON.parse(jsonMatch[0])
  } catch {
    throw new Error('JSON parse failed. The model may have truncated its response.')
  }

  return { reasoning, structured }
}

async function callAI({ prompt, systemPrompt, apiKey, provider, model }) {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, systemPrompt, apiKey, provider, model }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `AI request failed (${res.status})`)
  }
  const data = await res.json()
  return data.content
}

function dollar(n) {
  if (n == null) return 'N/A'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e12) return sign + '$' + (abs / 1e12).toFixed(1) + 'T'
  if (abs >= 1e9) return sign + '$' + (abs / 1e9).toFixed(1) + 'B'
  if (abs >= 1e6) return sign + '$' + (abs / 1e6).toFixed(1) + 'M'
  return sign + '$' + abs.toFixed(0)
}

function pct(n) {
  if (n == null) return 'N/A'
  return (n * 100).toFixed(1) + '%'
}
