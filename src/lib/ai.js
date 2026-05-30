const SYSTEM = `You are a senior equity research analyst. Be precise, data-driven, and take clear stances.`

export async function generateResearch({ ticker, financials, apiKey, provider, model, onProgress }) {
  const fin = financials
  const t = ticker.toUpperCase()

  const dataBlock = [
    `${fin.companyName} (${t})`,
    `Rev: ${dollar(fin.revenue)} (${pct(fin.revenueGrowth)} YoY) | Gross Margin: ${pct(fin.grossMargin)} | EBITDA Margin: ${pct(fin.ebitdaMargin)} | Net Margin: ${pct(fin.netMargin)}`,
    `FCF: ${dollar(fin.fcf)} (${pct(fin.fcfMargin)}) | OpCF: ${dollar(fin.operatingCF)} | CapEx: ${dollar(fin.capex)}`,
    `Cash: ${dollar(fin.cash)} | Net Debt: ${dollar(fin.netDebt)} | D/E: ${fin.debtToEquity != null ? fin.debtToEquity.toFixed(2) + 'x' : 'N/A'} | Int. Coverage: ${fin.interestCoverage != null ? fin.interestCoverage.toFixed(1) + 'x' : 'N/A'}`,
    `ROE: ${pct(fin.roe)} | ROA: ${pct(fin.roa)} | EPS: ${fin.eps != null ? '$' + fin.eps.toFixed(2) : 'N/A'} | Shares: ${fin.shares != null ? (fin.shares / 1e6).toFixed(0) + 'M' : 'N/A'}`,
  ].join('\n')

  const prompt = `Analyze ${t} using this SEC EDGAR data:
${dataBlock}

Respond with ONLY a valid JSON object (no markdown, no prose):
{"recommendation":"BUY"|"HOLD"|"SELL","targetPrice":number|null,"currentPrice":number|null,"upside":number|null,"companyDescription":"string","executiveSummary":"2-3 sentence summary","moatRating":"WIDE"|"NARROW"|"NONE","investmentThesis":"string","bullCase":["point with numbers","point with numbers","point with numbers"],"bearCase":["point with numbers","point with numbers","point with numbers"],"catalysts":["string","string"],"dcfAssumptions":{"nearTermGrowth":number,"longTermGrowth":number,"terminalGrowthRate":number,"wacc":number,"ebitdaMargin":number,"fcfConversionRate":number},"comps":[{"ticker":"string","name":"string","evEbitda":number|null,"peRatio":number|null,"revenueGrowth":number|null,"grossMargin":number|null}],"risks":[{"title":"string","description":"string","severity":"HIGH"|"MEDIUM"|"LOW","category":"FINANCIAL"|"OPERATIONAL"|"REGULATORY"|"COMPETITIVE"|"MACRO"}],"tradingMultiples":{"evRevenue":number|null,"evEbitda":number|null,"peRatio":number|null,"fcfYield":number|null},"financialHighlights":{"revenueGrowthComment":"string","marginComment":"string","balanceSheetComment":"string","fcfComment":"string"},"analystNote":"2-3 sentence conviction statement"}`

  onProgress?.('Analyzing...')
  const raw = await callAI({ systemPrompt: SYSTEM, prompt, apiKey, provider, model })

  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI returned unparseable output. Try again.')
  let structured
  try {
    structured = JSON.parse(jsonMatch[0])
  } catch {
    throw new Error('JSON parse failed. The model may have truncated its response.')
  }

  return { reasoning: null, structured }
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
