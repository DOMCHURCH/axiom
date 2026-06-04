const SYSTEM = `You are a managing director of equity research at a bulge-bracket investment bank with 20 years of experience covering public equities. You write for sophisticated institutional investors — pension funds, hedge funds, and family offices. Your analysis is precise, data-driven, and takes clear stances. You never hedge with "it depends" without explaining which way you lean. When data is limited, you make explicit assumptions and say so.`

export async function generateResearch({ ticker, financials, clerkToken, onProgress }) {
  const fin = financials
  const t = ticker.toUpperCase()

  const marketBlock = fin.price != null
    ? `Current Price: $${fin.price.toFixed(2)} | Market Cap: ${dollar(fin.marketCap)} (anchor your 12-month price target to this live price)\n`
    : ''

  const dataBlock = `${fin.companyName} (${t})
${marketBlock}
Revenue: ${dollar(fin.revenue)} | Prev: ${dollar(fin.prevRevenue)} | Growth: ${pct(fin.revenueGrowth)}
Gross Profit: ${dollar(fin.grossProfit)} | Gross Margin: ${pct(fin.grossMargin)}
EBIT: ${dollar(fin.ebit)} | EBITDA: ${dollar(fin.ebitda)} | EBITDA Margin: ${pct(fin.ebitdaMargin)}
Op Margin: ${pct(fin.operatingMargin)} | Net Income: ${dollar(fin.netIncome)} | Net Margin: ${pct(fin.netMargin)}
EPS: ${fin.eps != null ? '$' + fin.eps.toFixed(2) : 'N/A'} | D&A: ${dollar(fin.da)} | Interest: ${dollar(fin.interestExpense)}
Cash: ${dollar(fin.cash)} | Total Assets: ${dollar(fin.totalAssets)} | Equity: ${dollar(fin.totalEquity)}
LT Debt: ${dollar(fin.longTermDebt)} | Net Debt: ${dollar(fin.netDebt)} | Current Ratio: ${fin.currentRatio != null ? fin.currentRatio.toFixed(2) + 'x' : 'N/A'}
D/E: ${fin.debtToEquity != null ? fin.debtToEquity.toFixed(2) + 'x' : 'N/A'} | Int Coverage: ${fin.interestCoverage != null ? fin.interestCoverage.toFixed(1) + 'x' : 'N/A'} | ROE: ${pct(fin.roe)} | ROA: ${pct(fin.roa)}
Op CF: ${dollar(fin.operatingCF)} | CapEx: ${dollar(fin.capex)} | FCF: ${dollar(fin.fcf)} | FCF Margin: ${pct(fin.fcfMargin)}
FCF ex-SBC: ${dollar(fin.fcfExSbc)} | SBC: ${dollar(fin.sbc)} | R&D: ${dollar(fin.rnd)} | SG&A: ${dollar(fin.sga)}
PP&E: ${dollar(fin.ppe)} | Tax Rate: ${fin.impliedTaxRate != null ? pct(fin.impliedTaxRate) : 'N/A'} | Employees: ${fin.employees != null ? fin.employees.toLocaleString() : 'N/A'} | Rev/Employee: ${dollar(fin.revenuePerEmployee)}
Dividends: ${dollar(fin.dividendsPaid)} | Buybacks: ${dollar(fin.shareRepurchases)} | Shares: ${fin.shares != null ? (fin.shares / 1e6).toFixed(1) + 'M' : 'N/A'}`

  onProgress?.('Analyzing — generating research...')

  const prompt = `Analyze ${t} and output a JSON research report. Be specific with numbers. Output ONLY valid JSON — no markdown, no prose, no code fences.

DATA:
${dataBlock}

CRITICAL FORMATTING RULES:
- JSON NUMERIC FIELDS (dcfAssumptions, comps revenueGrowth/grossMargin, tradingMultiples fcfYield, upside): use decimals. 0.15 = 15%, 0.08 = 8%. NEVER whole-number percentages in these fields.
- PROSE TEXT FIELDS (executiveSummary, investmentThesis, bullCase, bearCase, analystNote, financialHighlights, companyDescription, catalysts, risks description): ALWAYS write percentages as formatted strings like "15.9%", "17% upside", "8.5% WACC". NEVER use bare decimals like 0.159 or 0.17 in prose text.
- Multiples (EV/EBITDA, P/E) are plain numbers: 24.5 means 24.5x. Realistic ranges: EV/EBITDA 5-50x, P/E 10-100x.
- upside field is a decimal: 0.15 = 15% upside. targetPrice is a dollar amount anchored to the live market price above.
- DCF assumptions must be realistic for the sector. For high-multiple tech stocks, use nearTermGrowth 0.10-0.20, longTermGrowth 0.06-0.10, terminalGrowthRate 0.025-0.03, wacc 0.08-0.10.

NARRATIVE ACCURACY RULES (prevent self-contradiction — the platform computes valuation multiples and DCF separately from live data):
- In PROSE, do NOT state specific valuation multiples (e.g. "EV/EBITDA of 24.5", "trades at 30x P/E"). The platform computes these from the live price and your guess will contradict it. Instead speak qualitatively: "trades at a premium multiple", "valuation is reasonable relative to peers".
- In PROSE, do NOT claim a specific "DCF upside" or "X% upside to our target". The DCF intrinsic value is computed separately and often sits BELOW the live price for high-multiple growth names. Only reference upside via the targetPrice-vs-current-price relationship, which equals the "upside" field.
- Only cite hard numbers you were actually GIVEN in the DATA block (revenue growth, margins, FCF, ROE, net debt). Never invent multiples or per-share DCF values in prose.
- Be precise about net debt direction: positive net debt = more debt than cash. The DATA above gives the exact figure — match it.

{"recommendation":"BUY"|"HOLD"|"SELL","targetPrice":number|null,"currentPrice":number|null,"upside":number|null,"companyDescription":"one sentence","executiveSummary":"3-4 sentences covering growth, margins, valuation stance","moatRating":"WIDE"|"NARROW"|"NONE","investmentThesis":"2-3 sentences — specific, data-driven, take a clear stance","bullCase":["point with specific number","point with specific number","point with specific number"],"bearCase":["point with specific number","point with specific number","point with specific number"],"catalysts":["specific near-term catalyst","specific near-term catalyst"],"dcfAssumptions":{"nearTermGrowth":0.12,"longTermGrowth":0.07,"terminalGrowthRate":0.025,"wacc":0.09,"ebitdaMargin":0.28,"fcfConversionRate":0.85},"comps":[{"ticker":"string","name":"string","evEbitda":24.5,"peRatio":32.1,"revenueGrowth":0.12,"grossMargin":0.68},{"ticker":"string","name":"string","evEbitda":18.2,"peRatio":28.4,"revenueGrowth":0.09,"grossMargin":0.72},{"ticker":"string","name":"string","evEbitda":21.0,"peRatio":30.5,"revenueGrowth":0.15,"grossMargin":0.61}],"risks":[{"title":"string","description":"string","severity":"HIGH"|"MEDIUM"|"LOW","category":"FINANCIAL"|"OPERATIONAL"|"REGULATORY"|"COMPETITIVE"|"MACRO"},{"title":"string","description":"string","severity":"HIGH"|"MEDIUM"|"LOW","category":"FINANCIAL"|"OPERATIONAL"|"REGULATORY"|"COMPETITIVE"|"MACRO"},{"title":"string","description":"string","severity":"HIGH"|"MEDIUM"|"LOW","category":"FINANCIAL"|"OPERATIONAL"|"REGULATORY"|"COMPETITIVE"|"MACRO"},{"title":"string","description":"string","severity":"HIGH"|"MEDIUM"|"LOW","category":"FINANCIAL"|"OPERATIONAL"|"REGULATORY"|"COMPETITIVE"|"MACRO"}],"tradingMultiples":{"evRevenue":number|null,"evEbitda":number|null,"peRatio":number|null,"fcfYield":number|null},"financialHighlights":{"revenueGrowthComment":"string","marginComment":"string","balanceSheetComment":"string","fcfComment":"string"},"analystNote":"2-3 sentences — definitive stance, cite specific numbers, no boilerplate"}`

  const raw = await callAI({ systemPrompt: SYSTEM, prompt, clerkToken })

  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI returned unparseable output. Try again.')
  let structured
  try {
    structured = JSON.parse(jsonMatch[0])
  } catch {
    throw new Error('JSON parse failed. Try again.')
  }
  return { reasoning: null, structured }
}

async function callAI({ prompt, systemPrompt, clerkToken, _retries = 0 }) {
  const headers = { 'Content-Type': 'application/json' }
  if (clerkToken) headers['Authorization'] = `Bearer ${clerkToken}`

  const res = await fetch('/api/ai', {
    method: 'POST',
    headers,
    body: JSON.stringify({ prompt, systemPrompt }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))

    // Groq rate limit — wait and retry once
    if (res.status === 429 && !err.limitReached && _retries < 2) {
      const waitMatch = err.error?.match(/try again in ([\d.]+)s/i)
      const wait = waitMatch ? Math.ceil(parseFloat(waitMatch[1])) + 1 : 5
      await sleep(wait * 1000)
      return callAI({ prompt, systemPrompt, clerkToken, _retries: _retries + 1 })
    }

    throw Object.assign(new Error(err.error || `Request failed (${res.status})`), {
      limitReached: err.limitReached,
      requiresAuth: err.requiresAuth,
      resetAt: err.resetAt,
    })
  }

  const data = await res.json()
  return data.content
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

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
