export async function generateResearch({ ticker, financials, apiKey, provider, model, onProgress }) {
  const pass1Prompt = `You are a senior equity research analyst at a top-tier investment bank.

Analyze ${ticker} based on the following SEC EDGAR financial data:
${JSON.stringify(financials, null, 2)}

Think through the investment case step by step:
1. Business model and competitive positioning
2. Revenue trends and growth drivers
3. Margin structure and profitability
4. Balance sheet strength and capital allocation
5. Valuation relative to peers
6. Key risks and mitigants
7. Investment recommendation and price target rationale

Be thorough, specific, and use the financial data provided. Think like an IB analyst writing for institutional clients.`

  onProgress?.('Running analysis (pass 1/2)...')
  const reasoning = await callAI({ prompt: pass1Prompt, apiKey, provider, model })

  const pass2Prompt = `Based on this investment analysis:
${reasoning}

Extract structured data as valid JSON (no markdown, no explanation, just JSON):
{
  "recommendation": "BUY" | "HOLD" | "SELL",
  "targetPrice": number | null,
  "currentPrice": number | null,
  "upside": number | null,
  "executiveSummary": "2-3 sentence summary",
  "bullCase": ["point 1", "point 2", "point 3"],
  "bearCase": ["point 1", "point 2", "point 3"],
  "dcfAssumptions": {
    "revenueGrowth": number,
    "ebitdaMargin": number,
    "wacc": number,
    "terminalGrowthRate": number,
    "fcfConversionRate": number
  },
  "comps": [
    { "ticker": "...", "evEbitda": number | null, "peRatio": number | null, "revenueGrowth": number | null }
  ],
  "risks": [
    { "title": "...", "description": "...", "severity": "HIGH" | "MEDIUM" | "LOW" }
  ],
  "analystNote": "1-2 sentence closing note",
  "keyMetrics": {
    "revenue": number | null,
    "revenueGrowth": number | null,
    "grossMargin": number | null,
    "ebitdaMargin": number | null,
    "netIncome": number | null,
    "fcf": number | null,
    "totalDebt": number | null,
    "cash": number | null,
    "shares": number | null
  }
}`

  onProgress?.('Extracting structured data (pass 2/2)...')
  const raw = await callAI({ prompt: pass2Prompt, apiKey, provider, model })

  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Failed to parse structured output from AI')
  const structured = JSON.parse(jsonMatch[0])

  return { reasoning, structured }
}

async function callAI({ prompt, apiKey, provider, model }) {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, apiKey, provider, model }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `AI request failed: ${res.status}`)
  }
  const data = await res.json()
  return data.content
}
