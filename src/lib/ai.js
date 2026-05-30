const SYSTEM = `You are a managing director of equity research at a bulge-bracket investment bank with 20 years of experience covering public equities. You write for sophisticated institutional investors — pension funds, hedge funds, and family offices. Your analysis is precise, data-driven, and takes clear stances. You never hedge with "it depends" without explaining which way you lean. When data is limited, you make explicit assumptions and say so.`

export async function generateResearch({ ticker, financials, apiKey, provider, model, onProgress }) {
  const fin = financials

  const dataBlock = `
COMPANY: ${fin.companyName} (${fin.ticker})
CIK: ${fin.cik}

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
EPS (Basic):           ${fin.eps != null ? '$' + fin.eps.toFixed(2) : 'N/A'}
D&A:                   ${dollar(fin.da)}
Interest Expense:      ${dollar(fin.interestExpense)}

=== BALANCE SHEET ===
Cash & Equivalents:    ${dollar(fin.cash)}
Total Assets:          ${dollar(fin.totalAssets)}
Total Liabilities:     ${dollar(fin.totalLiabilities)}
Stockholders Equity:   ${dollar(fin.totalEquity)}
Long-Term Debt:        ${dollar(fin.longTermDebt)}
Short-Term Debt:       ${dollar(fin.shortTermDebt)}
Net Debt:              ${dollar(fin.netDebt)}
Goodwill:              ${dollar(fin.goodwill)}
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

  const pass1Prompt = `Conduct a comprehensive equity research deep-dive on ${ticker.toUpperCase()}.

${dataBlock}

Structure your analysis across these sections. Be specific — reference actual numbers from the data above:

1. BUSINESS OVERVIEW & COMPETITIVE MOAT
   - Core business model and revenue drivers
   - Competitive positioning and moat (pricing power, switching costs, network effects, scale)
   - Industry dynamics and secular tailwinds/headwinds

2. FINANCIAL ANALYSIS
   - Revenue quality and growth trajectory (is growth accelerating or decelerating?)
   - Margin structure: gross, EBITDA, operating, net — trend and benchmarks vs. peers
   - FCF generation quality (working capital dynamics, capex intensity)
   - Balance sheet: leverage, liquidity, capital allocation priorities
   - Return on capital metrics (ROE, ROA) and trend

3. VALUATION FRAMEWORK
   - Estimate current price and market cap (use shares outstanding + EPS/net income)
   - Select appropriate valuation multiples for this sector
   - DCF assumptions: near-term growth (3Y), long-term growth (5Y), terminal growth, WACC
   - Implied intrinsic value per share from your DCF
   - Current trading multiples vs. historical averages and sector peers

4. BULL CASE (specific, numerical, 3 points)

5. BEAR CASE (specific, numerical, 3 points)

6. RISK MATRIX
   - Identify 4-6 distinct risks, rate each HIGH/MEDIUM/LOW with 1-2 sentence description

7. INVESTMENT RECOMMENDATION
   - BUY / HOLD / SELL with 12-month price target
   - State upside/downside percentage explicitly
   - Key catalysts to watch in next 2 quarters`

  onProgress?.('Pass 1/2 — analyst reasoning...')
  const reasoning = await callAI({ systemPrompt: SYSTEM, prompt: pass1Prompt, apiKey, provider, model })

  const pass2Prompt = `You produced this equity research analysis:

${reasoning}

Now extract ALL structured fields into valid JSON. Output ONLY the JSON object — no markdown, no prose, no code fences.

{
  "recommendation": "BUY" | "HOLD" | "SELL",
  "targetPrice": <12-month price target as number, or null>,
  "currentPrice": <estimated current price as number, or null>,
  "upside": <decimal, e.g. 0.23 for 23% upside, negative for downside, or null>,
  "companyDescription": "<one sentence: what the company does>",
  "executiveSummary": "<3-4 sentences: investment thesis summary for an institutional investor>",
  "moatRating": "WIDE" | "NARROW" | "NONE",
  "moatDescription": "<one sentence on competitive advantage>",
  "investmentThesis": "<2-3 sentences on the core reason to own or avoid>",
  "bullCase": [
    "<specific bull point with numbers>",
    "<specific bull point with numbers>",
    "<specific bull point with numbers>"
  ],
  "bearCase": [
    "<specific bear point with numbers>",
    "<specific bear point with numbers>",
    "<specific bear point with numbers>"
  ],
  "catalysts": ["<catalyst 1>", "<catalyst 2>"],
  "dcfAssumptions": {
    "nearTermGrowth": <3Y revenue CAGR as decimal, e.g. 0.12>,
    "longTermGrowth": <5Y revenue CAGR as decimal>,
    "terminalGrowthRate": <terminal growth as decimal, e.g. 0.025>,
    "wacc": <WACC as decimal, e.g. 0.09>,
    "ebitdaMargin": <normalized EBITDA margin as decimal>,
    "fcfConversionRate": <FCF as % of EBITDA, decimal>
  },
  "comps": [
    {
      "ticker": "<peer ticker>",
      "name": "<company name>",
      "evEbitda": <number or null>,
      "peRatio": <number or null>,
      "revenueGrowth": <decimal or null>,
      "grossMargin": <decimal or null>
    }
  ],
  "risks": [
    {
      "title": "<risk name>",
      "description": "<1-2 sentence description with specifics>",
      "severity": "HIGH" | "MEDIUM" | "LOW",
      "category": "FINANCIAL" | "OPERATIONAL" | "REGULATORY" | "COMPETITIVE" | "MACRO"
    }
  ],
  "tradingMultiples": {
    "evRevenue": <number or null>,
    "evEbitda": <number or null>,
    "peRatio": <number or null>,
    "pbRatio": <number or null>,
    "fcfYield": <decimal or null>
  },
  "financialHighlights": {
    "revenueGrowthComment": "<one sentence on revenue trajectory>",
    "marginComment": "<one sentence on margin structure>",
    "balanceSheetComment": "<one sentence on leverage/liquidity>",
    "fcfComment": "<one sentence on cash generation>"
  },
  "analystNote": "<2-3 sentence closing conviction statement — take a clear stance>"
}`

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
  if (abs >= 1e12) return sign + '$' + (abs / 1e12).toFixed(2) + 'T'
  if (abs >= 1e9) return sign + '$' + (abs / 1e9).toFixed(2) + 'B'
  if (abs >= 1e6) return sign + '$' + (abs / 1e6).toFixed(2) + 'M'
  return sign + '$' + abs.toFixed(0)
}

function pct(n) {
  if (n == null) return 'N/A'
  return (n * 100).toFixed(1) + '%'
}
