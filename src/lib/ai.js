const SYSTEM = `You are a managing director of equity research at a bulge-bracket investment bank with 20 years of experience covering public equities. You write for sophisticated institutional investors — pension funds, hedge funds, and family offices. Your analysis is precise, data-driven, and takes clear stances. You never hedge with "it depends" without explaining which way you lean. When data is limited, you make explicit assumptions and say so.`

export async function generateResearch({ ticker, financials, apiKey, provider, model, onProgress }) {
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
Dividends: ${dollar(fin.dividendsPaid)} | Buybacks: ${dollar(fin.shareRepurchases)} | Shares: ${fin.shares != null ? (fin.shares / 1e6).toFixed(1) + 'M' : 'N/A'}`

  // Groq free tier: 12k TPM — use single-pass to avoid hitting the limit twice
  if (provider === 'groq') {
    return generateSinglePass({ t, dataBlock, apiKey, provider, model, onProgress })
  }

  return generateTwoPass({ t, dataBlock, apiKey, provider, model, onProgress, fin })
}

async function generateTwoPass({ t, dataBlock, apiKey, provider, model, onProgress, fin }) {
  const pass1Prompt = `Conduct a comprehensive equity research analysis on ${t}.

${dataBlock}

Structure your analysis across these sections. Be specific — reference actual numbers:

1. BUSINESS OVERVIEW & COMPETITIVE MOAT
   - Core business model and revenue drivers
   - Competitive positioning and moat (pricing power, switching costs, network effects, scale)
   - Industry dynamics and secular tailwinds/headwinds

2. FINANCIAL ANALYSIS
   - Revenue quality and growth trajectory (accelerating or decelerating?)
   - Margin structure: gross, EBITDA, operating, net — trend and peer benchmarks
   - FCF generation quality (working capital, capex intensity)
   - Balance sheet: leverage, liquidity, capital allocation
   - Return on capital (ROE, ROA) trend

3. VALUATION FRAMEWORK
   - DCF assumptions: near-term growth (3Y), long-term growth (5Y), terminal growth, WACC
   - Implied intrinsic value per share
   - Current trading multiples vs. sector peers

4. BULL CASE — 3 specific points with numbers

5. BEAR CASE — 3 specific points with numbers

6. RISK MATRIX — 4-6 risks, each rated HIGH/MEDIUM/LOW

7. INVESTMENT RECOMMENDATION — BUY/HOLD/SELL, 12-month price target, upside %, 2 near-term catalysts`

  onProgress?.('Pass 1/2 — analyst reasoning...')
  const reasoning = await callAI({ systemPrompt: SYSTEM, prompt: pass1Prompt, apiKey, provider, model, onProgress })

  const pass2Prompt = `Based on this equity research analysis of ${t}:

${reasoning}

Extract ALL fields into valid JSON. Output ONLY the JSON object — no markdown, no prose, no code fences.

{"recommendation":"BUY"|"HOLD"|"SELL","targetPrice":number|null,"currentPrice":number|null,"upside":number|null,"companyDescription":"string","executiveSummary":"string","moatRating":"WIDE"|"NARROW"|"NONE","investmentThesis":"string","bullCase":["specific point WITH actual numbers from the data","specific point WITH actual numbers","specific point WITH actual numbers"],"bearCase":["specific point WITH actual numbers","specific point WITH actual numbers","specific point WITH actual numbers"],"catalysts":["near-term specific catalyst","near-term specific catalyst"],"dcfAssumptions":{"nearTermGrowth":number,"longTermGrowth":number,"terminalGrowthRate":number,"wacc":number,"ebitdaMargin":number,"fcfConversionRate":number},"comps":[{"ticker":"string","name":"string","evEbitda":number|null,"peRatio":number|null,"revenueGrowth":number|null,"grossMargin":number|null}],"risks":[{"title":"string","description":"string","severity":"HIGH"|"MEDIUM"|"LOW","category":"FINANCIAL"|"OPERATIONAL"|"REGULATORY"|"COMPETITIVE"|"MACRO"}],"tradingMultiples":{"evRevenue":number|null,"evEbitda":number|null,"peRatio":number|null,"fcfYield":number|null},"financialHighlights":{"revenueGrowthComment":"string","marginComment":"string","balanceSheetComment":"string","fcfComment":"string"},"analystNote":"2-3 sentence conviction statement — take a clear definitive stance, reference specific numbers, no generic boilerplate"}`

  onProgress?.('Pass 2/2 — structuring output...')
  const raw = await callAI({ systemPrompt: SYSTEM, prompt: pass2Prompt, apiKey, provider, model, onProgress })

  return parseStructured(raw, reasoning)
}

async function generateSinglePass({ t, dataBlock, apiKey, provider, model, onProgress }) {
  onProgress?.('Analyzing — generating research...')

  const prompt = `Analyze ${t} and output a JSON research report. Be specific with numbers. Output ONLY valid JSON — no markdown, no prose, no code fences.

DATA:
${dataBlock}

JSON schema (fill every field with real analysis — no nulls where data exists):
{"recommendation":"BUY"|"HOLD"|"SELL","targetPrice":number|null,"currentPrice":number|null,"upside":number|null,"companyDescription":"one sentence","executiveSummary":"3-4 sentences covering growth, margins, valuation stance","moatRating":"WIDE"|"NARROW"|"NONE","investmentThesis":"2-3 sentences — specific, data-driven, take a clear stance","bullCase":["point with specific number","point with specific number","point with specific number"],"bearCase":["point with specific number","point with specific number","point with specific number"],"catalysts":["specific near-term catalyst","specific near-term catalyst"],"dcfAssumptions":{"nearTermGrowth":number,"longTermGrowth":number,"terminalGrowthRate":number,"wacc":number,"ebitdaMargin":number,"fcfConversionRate":number},"comps":[{"ticker":"string","name":"string","evEbitda":number|null,"peRatio":number|null,"revenueGrowth":number|null,"grossMargin":number|null},{"ticker":"string","name":"string","evEbitda":number|null,"peRatio":number|null,"revenueGrowth":number|null,"grossMargin":number|null},{"ticker":"string","name":"string","evEbitda":number|null,"peRatio":number|null,"revenueGrowth":number|null,"grossMargin":number|null}],"risks":[{"title":"string","description":"string","severity":"HIGH"|"MEDIUM"|"LOW","category":"FINANCIAL"|"OPERATIONAL"|"REGULATORY"|"COMPETITIVE"|"MACRO"},{"title":"string","description":"string","severity":"HIGH"|"MEDIUM"|"LOW","category":"FINANCIAL"|"OPERATIONAL"|"REGULATORY"|"COMPETITIVE"|"MACRO"},{"title":"string","description":"string","severity":"HIGH"|"MEDIUM"|"LOW","category":"FINANCIAL"|"OPERATIONAL"|"REGULATORY"|"COMPETITIVE"|"MACRO"},{"title":"string","description":"string","severity":"HIGH"|"MEDIUM"|"LOW","category":"FINANCIAL"|"OPERATIONAL"|"REGULATORY"|"COMPETITIVE"|"MACRO"}],"tradingMultiples":{"evRevenue":number|null,"evEbitda":number|null,"peRatio":number|null,"fcfYield":number|null},"financialHighlights":{"revenueGrowthComment":"string","marginComment":"string","balanceSheetComment":"string","fcfComment":"string"},"analystNote":"2-3 sentences — definitive stance, cite specific numbers, no boilerplate"}`

  const raw = await callAI({ systemPrompt: SYSTEM, prompt, apiKey, provider, model, onProgress })
  return parseStructured(raw, null)
}

function parseStructured(raw, reasoning) {
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI returned unparseable output. Try again.')
  let structured
  try {
    structured = JSON.parse(jsonMatch[0])
  } catch {
    throw new Error('JSON parse failed. The model may have truncated its response.')
  }
  return { reasoning: reasoning ?? raw, structured }
}

async function callAI({ prompt, systemPrompt, apiKey, provider, model, onProgress }) {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, systemPrompt, apiKey, provider, model }),
  })

  if (res.status === 429 || res.status === 500) {
    const err = await res.json().catch(() => ({}))
    const msg = err.error || ''
    const waitMatch = msg.match(/try again in ([\d.]+)s/i)
    if (waitMatch) {
      const waitSec = Math.ceil(parseFloat(waitMatch[1])) + 2
      for (let i = waitSec; i > 0; i--) {
        onProgress?.(`Rate limited — retrying in ${i}s...`)
        await sleep(1000)
      }
      return callAI({ prompt, systemPrompt, apiKey, provider, model, onProgress })
    }
    throw new Error(msg || `AI request failed (${res.status})`)
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `AI request failed (${res.status})`)
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
