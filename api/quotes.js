// Live quotes for a list of tickers — proxies Yahoo Finance (no key needed)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { tickers } = req.query
  if (!tickers) return res.status(400).json({ error: 'tickers required' })

  const syms = tickers.split(',').map(t => t.trim().toUpperCase()).filter(Boolean).slice(0, 20)

  try {
    const results = await Promise.allSettled(
      syms.map(async sym => {
        const r = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=2d`,
          { headers: { 'User-Agent': 'Mozilla/5.0' } }
        )
        if (!r.ok) return null
        const d = await r.json()
        const meta = d?.chart?.result?.[0]?.meta
        if (!meta) return null
        const price = meta.regularMarketPrice ?? null
        const prev = meta.chartPreviousClose ?? meta.previousClose ?? null
        const chg = price != null && prev != null && prev !== 0
          ? ((price - prev) / prev) * 100 : null
        return { sym, price, chg }
      })
    )

    const quotes = results
      .map((r, i) => r.status === 'fulfilled' && r.value ? r.value : { sym: syms[i], price: null, chg: null })

    // Cache for 60s at the edge — prices don't need to be tick-accurate on a landing page
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120')
    res.status(200).json({ quotes })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
