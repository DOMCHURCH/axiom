const SYSTEM = `You are a managing director of equity research at a bulge-bracket investment bank with 20 years of experience covering public equities. You write for sophisticated institutional investors — pension funds, hedge funds, and family offices. Your analysis is precise, data-driven, and takes clear stances. You never hedge with "it depends" without explaining which way you lean. When data is limited, you make explicit assumptions and say so.`

export async function generateResearch({ ticker, financials, apiKey, provider, model, onProgress }) {
  const fin = financials
  const t = ticker.toUpperCase()

  const dataBlock = `
COMPANY: ${fin.companyName} (${t})

=== INCOME STATEMENT ===
Revenue (TTM):         ${dollar(fin.revenue)}
Revenue (Prior Year):  ${dollar(fin.prevRevenue)}
Revenue Growth YoY:    ${pct(fin.revenueGrowth)}
Gross Profit:          ${dollar(fin.grossProfit)}
Gross Margin:          ${pct(fin.grossMargin)}
EBIT:                  ${dollar(fin.ebit)}
EBITDA:                ${dollar(fin.ebitda)}
EBITDA Margin:         ${pct(fin.ebitdaMargin)}
Operating Margin:      ${pct(fin.operatingMargin)}
Net Income:            ${dollar(fin.netIncome)}
Net Margin:            ${pct(fin.netMargin)}
EPS:                   ${fin.eps != null ? '$' + fin.eps.toFixed(2) : 'N/A'}
D&A:                   ${dollar(fin.da)}
Interest Expense:      ${dollar(fin.interestExpense)}

=== BALANCE SHEET ===
Cash:                  ${dollar(fin.cash)}
Total Assets:          ${dollar(fin.totalAssets)}
Stockholders Equity:   ${dollar(fin.totalEquity)}
Long-Term Debt:        ${dollar(fin.longTermDebt)}
Net Debt:              ${dollar(fin.netDebt)}
Current Ratio:         ${fin.currentRatio != null ? fin.currentRatio.toFixed(2) + 'x' : 'N/A'}
Debt/Equity:           ${fin.debtToEquity != null ? fin.debtToEquity.toFixed(2) + 'x' : 'N/A'}
Interest Coverage:     ${fin.interestCoverage != null ? fin.interestCoverage.toFixed(1) + 'x' : 'N/A'}
ROE:                   ${pct(fin.roe)}
ROA:                   ${pct(fin.roa)}

=== CASH FLOW ===
Operating Cash Flow:   ${dollar(fin.operatingCF)}
CapEx:                 ${dollar(fin.capex)}
Free Cash Flow:        ${dollar(fin.fcf)}
FCF Margin:            ${pct(fin.fcfMargin)}
Dividends Paid:        ${dollar(fin.dividendsPaid)}
Share Repurchases:     ${dollar(fin.shareRepurchases)}
Shares Outstanding:    ${fin.shares != null ? (fin.shares / 1e6).toFixed(1) + 'M' : 'N/A'}
`.trim()

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
   - Estimate current price and market cap
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

{"recommendation":"BUY"|"HOLD"|"SELL","targetPrice":number|null,"currentPrice":number|null,"upside":number|null,"companyDescription":"string","executiveSummary":"string","moatRating":"WIDE"|"NARROW"|"NONE","investmentThesis":"string","bullCase":["specific point WITH actual numbers from the data","specific point WITH actual numbers","specific point WITH actual numbers"],"bearCase":["specific point WITH actual numbers","specific point WITH actual numbers","specific point WITH actual numbers"],"catalysts":["near-term specific catalyst","near-term specific catalyst"],"dcfAssumptions":{"nearTermGrowth":number,"longTermGrowth":number,"terminalGrowthRate":number,"wacc":number,"ebitdaMargin":number,"fcfConversionRate":number},"comps":[{"ticker":"string","name":"string","evEbitda":number|null,"peRatio":number|null,"revenueGrowth":number|null,"grossMargin":number|null}],"risks":[{"title":"string","description":"string","severity":"HIGH"|"MEDIUM"|"LOW","category":"FINANCIAL"|"OPERATIONAL"|"REGULATORY"|"COMPETITIVE"|"MACRO"}],"tradingMultiples":{"evRevenue":number|null,"evEbitda":number|null,"peRatio":number|null,"fcfYield":number|null},"financialHighlights":{"revenueGrowthComment":"string","marginComment":"string","balanceSheetComment":"string","fcfComment":"string"},"analystNote":"string"}`

  onProgress?.('Pass 2/2 — structuring output...')
  const raw = await callAI({ systemPrompt: SYSTEM, prompt: pass2Prompt, apiKey, provider, model, onProgress })

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

async function callAI({ prompt, systemPrompt, apiKey, provider, model, onProgress }) {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, systemPrompt, apiKey, provider, model }),
  })

  if (res.status === 429 || res.status === 500) {
    const err = await res.json().catch(() => ({}))
    const msg = err.error || ''
    // Parse wait seconds from Groq rate limit message: "Please try again in 38.32s"
    const waitMatch = msg.match(/try again in ([\d.]+)s/i)
    if (waitMatch) {
      const waitSec = Math.ceil(parseFloat(waitMatch[1])) + 2
      for (let i = waitSec; i > 0; i--) {
        onProgress?.(`Rate limit — retrying in ${i}s...`)
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
