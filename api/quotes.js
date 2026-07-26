// Live quotes for a list of tickers.
//
// Provider selection, bounding, caching and throttle detection all live in
// _prices.js — this route is just the HTTP shell. It never hangs: if every
// provider is unreachable it returns null prices with `degraded: true` rather
// than holding the connection open until the function times out.
import { getQuotes } from './_prices.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { tickers } = req.query
  if (!tickers) return res.status(400).json({ error: 'tickers required' })

  const syms = tickers.split(',').map(t => t.trim().toUpperCase()).filter(Boolean).slice(0, 20)

  try {
    const { quotes, sources, degraded, reason } = await getQuotes(syms)

    // Only cache a clean response at the edge. Caching a degraded one would pin
    // "price unavailable" in front of every visitor for the full minute, long
    // after the provider recovered.
    if (!degraded) {
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120')
    } else {
      res.setHeader('Cache-Control', 'no-store')
    }
    res.status(200).json({ quotes, sources, degraded, reason })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
