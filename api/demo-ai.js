const SYSTEM = `You are a managing director of equity research at a bulge-bracket investment bank with 20 years of experience covering public equities. You write for sophisticated institutional investors — pension funds, hedge funds, and family offices. Your analysis is precise, data-driven, and takes clear stances. You never hedge with "it depends" without explaining which way you lean. When data is limited, you make explicit assumptions and say so.`

// In-memory IP rate limit — persists across warm invocations, resets on cold starts.
// Supplements the cookie layer: harder to bypass because it's server-side.
const _ipMap = new Map() // ip → timestamp of last demo
const IP_WINDOW = 24 * 60 * 60 * 1000

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Server-side IP rate limit (harder to bypass than cookies)
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown'
  const ipLast = _ipMap.get(ip)
  if (ipLast && Date.now() - ipLast < IP_WINDOW) {
    return res.status(429).json({
      error: 'Demo limit reached — 1 free report per 24 hours. Sign up for a free account for unlimited reports.',
      limitReached: true,
    })
  }

  // Cookie-based rate limit (secondary layer)
  const cookies = req.headers.cookie || ''
  const demoMatch = cookies.match(/axiom_demo=(\d+)/)
  if (demoMatch) {
    const age = Date.now() - parseInt(demoMatch[1], 10)
    if (age < IP_WINDOW) {
      return res.status(429).json({
        error: 'Demo limit reached — 1 free report per 24 hours. Sign up for a free account for unlimited reports.',
        limitReached: true,
      })
    }
  }

  const { ticker, financials: fin } = req.body || {}
  if (!ticker || !fin) return res.status(400).json({ error: 'ticker and financials required' })

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return res.status(503).json({ error: 'Demo mode is temporarily unavailable.' })

  const t = ticker.trim().toUpperCase()
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

  const prompt = `Analyze ${t} and output a JSON research report. Be specific with numbers from the data provided. Output ONLY valid JSON — no markdown, no prose, no code fences.

DATA:
${dataBlock}

CRITICAL FORMATTING RULES:
- JSON NUMERIC FIELDS (dcfAssumptions, comps revenueGrowth/grossMargin, tradingMultiples fcfYield, upside): use decimals. 0.15 = 15%, 0.08 = 8%. NEVER whole-number percentages in these fields.
- PROSE TEXT FIELDS (executiveSummary, investmentThesis, bullCase, bearCase, analystNote, financialHighlights, companyDescription, catalysts, risks description): ALWAYS write percentages as formatted strings like "15.9%", "17% upside", "8.5% WACC". NEVER use bare decimals like 0.159 or 0.17 in prose text.
- Multiples (EV/EBITDA, P/E) are plain numbers: 24.5 means 24.5x. Realistic ranges: EV/EBITDA 5-50x, P/E 10-100x.
- upside field is a decimal: 0.15 = 15% upside. targetPrice is a dollar amount anchored to the live market price above.
- DCF assumptions must be realistic for the sector. For high-multiple tech stocks, use nearTermGrowth 0.10-0.20, longTermGrowth 0.06-0.10, terminalGrowthRate 0.025-0.03, wacc 0.08-0.10.

NARRATIVE ACCURACY RULES (prevent self-contradiction):
- In PROSE, do NOT state specific valuation multiples (e.g. "EV/EBITDA of 24.5"). Speak qualitatively: "trades at a premium multiple".
- Only cite hard numbers you were actually GIVEN in the DATA block. Never invent multiples or DCF values in prose.
- Be precise about net debt direction: positive net debt = more debt than cash.

{"recommendation":"BUY"|"HOLD"|"SELL","targetPrice":number|null,"currentPrice":number|null,"upside":number|null,"companyDescription":"one sentence","executiveSummary":"3-4 sentences covering growth, margins, valuation stance","moatRating":"WIDE"|"NARROW"|"NONE","investmentThesis":"2-3 sentences — specific, data-driven, take a clear stance","bullCase":["point with specific number","point with specific number","point with specific number"],"bearCase":["point with specific number","point with specific number","point with specific number"],"catalysts":["specific near-term catalyst","specific near-term catalyst"],"dcfAssumptions":{"nearTermGrowth":0.12,"longTermGrowth":0.07,"terminalGrowthRate":0.025,"wacc":0.09,"ebitdaMargin":0.28,"fcfConversionRate":0.85},"comps":[{"ticker":"string","name":"string","evEbitda":24.5,"peRatio":32.1,"revenueGrowth":0.12,"grossMargin":0.68},{"ticker":"string","name":"string","evEbitda":18.2,"peRatio":28.4,"revenueGrowth":0.09,"grossMargin":0.72},{"ticker":"string","name":"string","evEbitda":21.0,"peRatio":30.5,"revenueGrowth":0.15,"grossMargin":0.61}],"risks":[{"title":"string","description":"string","severity":"HIGH"|"MEDIUM"|"LOW","category":"FINANCIAL"|"OPERATIONAL"|"REGULATORY"|"COMPETITIVE"|"MACRO"},{"title":"string","description":"string","severity":"HIGH"|"MEDIUM"|"LOW","category":"FINANCIAL"|"OPERATIONAL"|"REGULATORY"|"COMPETITIVE"|"MACRO"},{"title":"string","description":"string","severity":"HIGH"|"MEDIUM"|"LOW","category":"FINANCIAL"|"OPERATIONAL"|"REGULATORY"|"COMPETITIVE"|"MACRO"},{"title":"string","description":"string","severity":"HIGH"|"MEDIUM"|"LOW","category":"FINANCIAL"|"OPERATIONAL"|"REGULATORY"|"COMPETITIVE"|"MACRO"}],"tradingMultiples":{"evRevenue":number|null,"evEbitda":number|null,"peRatio":number|null,"fcfYield":number|null},"financialHighlights":{"revenueGrowthComment":"string","marginComment":"string","balanceSheetComment":"string","fcfComment":"string"},"analystNote":"2-3 sentences — definitive stance, cite specific numbers, no boilerplate"}`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 45_000)
    let r
    try {
      r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: prompt },
          ],
          max_tokens: 4096,
        }),
      })
    } catch (fetchErr) {
      clearTimeout(timeout)
      if (fetchErr.name === 'AbortError') return res.status(504).json({ error: 'Request timed out — try again.' })
      throw fetchErr
    }
    clearTimeout(timeout)

    const data = await r.json()
    if (!r.ok) {
      const msg = data.error?.message || `Groq error ${r.status}`
      // Surface rate limit helpfully
      if (r.status === 429) {
        return res.status(429).json({ error: 'Demo is busy — try again in a moment.' })
      }
      return res.status(502).json({ error: msg })
    }

    const raw = data.choices?.[0]?.message?.content || ''
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return res.status(502).json({ error: 'AI returned unparseable output. Try again.' })

    let structured
    try {
      structured = JSON.parse(jsonMatch[0])
    } catch {
      return res.status(502).json({ error: 'JSON parse failed. Try again.' })
    }

    // Record IP and set cookie — both used as rate limit layers
    _ipMap.set(ip, Date.now())
    res.setHeader('Set-Cookie', `axiom_demo=${Date.now()}; Max-Age=86400; Path=/; HttpOnly; SameSite=Strict`)
    return res.status(200).json({ structured, reasoning: null })
  } catch (err) {
    console.error('Demo AI error:', err)
    return res.status(500).json({ error: err.message })
  }
}
