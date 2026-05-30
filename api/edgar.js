export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { ticker } = req.query
  if (!ticker) return res.status(400).json({ error: 'ticker required' })

  try {
    // Resolve ticker → CIK
    const searchRes = await fetch(
      `https://efts.sec.gov/LATEST/search-index?q=%22${ticker.toUpperCase()}%22&dateRange=custom&startdt=2020-01-01&forms=10-K`,
      { headers: { 'User-Agent': 'AXIOM research@axiom.app' } }
    )

    const tickerRes = await fetch(
      `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=&CIK=${ticker}&type=10-K&dateb=&owner=include&count=5&search_text=&output=atom`,
      { headers: { 'User-Agent': 'AXIOM research@axiom.app' } }
    )

    // Get CIK from EDGAR company tickers JSON
    const tickerMapRes = await fetch('https://www.sec.gov/files/company_tickers.json', {
      headers: { 'User-Agent': 'AXIOM research@axiom.app' }
    })
    const tickerMap = await tickerMapRes.json()

    let cik = null
    for (const entry of Object.values(tickerMap)) {
      if (entry.ticker.toUpperCase() === ticker.toUpperCase()) {
        cik = String(entry.cik_str).padStart(10, '0')
        break
      }
    }

    if (!cik) return res.status(404).json({ error: `Ticker ${ticker} not found in SEC EDGAR` })

    // Fetch company facts (financials)
    const factsRes = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, {
      headers: { 'User-Agent': 'AXIOM research@axiom.app' }
    })
    if (!factsRes.ok) return res.status(502).json({ error: 'Failed to fetch EDGAR company facts' })

    const facts = await factsRes.json()
    const usgaap = facts.facts?.['us-gaap'] || {}

    function latest(concept, unit = 'USD') {
      const data = usgaap[concept]?.units?.[unit]
      if (!data) return null
      const annual = data.filter(d => d.form === '10-K' && d.val != null).sort((a, b) => b.end.localeCompare(a.end))
      return annual[0]?.val ?? null
    }

    function latestTwo(concept, unit = 'USD') {
      const data = usgaap[concept]?.units?.[unit]
      if (!data) return [null, null]
      const annual = data.filter(d => d.form === '10-K' && d.val != null).sort((a, b) => b.end.localeCompare(a.end))
      return [annual[0]?.val ?? null, annual[1]?.val ?? null]
    }

    const [revenue, prevRevenue] = latestTwo('Revenues') || latestTwo('RevenueFromContractWithCustomerExcludingAssessedTax')
    const netIncome = latest('NetIncomeLoss')
    const grossProfit = latest('GrossProfit')
    const operatingIncome = latest('OperatingIncomeLoss')
    const ebitda = latest('OperatingIncomeLoss') // rough proxy
    const cash = latest('CashAndCashEquivalentsAtCarryingValue')
    const totalDebt = latest('LongTermDebt')
    const shares = latest('CommonStockSharesOutstanding', 'shares')
    const capex = latest('PaymentsToAcquirePropertyPlantAndEquipment')
    const operatingCF = latest('NetCashProvidedByUsedInOperatingActivities')
    const fcf = operatingCF != null && capex != null ? operatingCF - capex : null

    const revenueGrowth = revenue && prevRevenue ? (revenue - prevRevenue) / Math.abs(prevRevenue) : null
    const grossMargin = revenue && grossProfit ? grossProfit / revenue : null
    const netMargin = revenue && netIncome ? netIncome / revenue : null

    const financials = {
      ticker: ticker.toUpperCase(),
      companyName: facts.entityType ? `${ticker.toUpperCase()}` : ticker.toUpperCase(),
      cik,
      revenue,
      prevRevenue,
      revenueGrowth,
      grossProfit,
      grossMargin,
      operatingIncome,
      netIncome,
      netMargin,
      ebitda,
      cash,
      totalDebt,
      netDebt: totalDebt != null && cash != null ? totalDebt - cash : null,
      shares,
      capex,
      operatingCF,
      fcf,
    }

    res.status(200).json({ financials })
  } catch (err) {
    console.error('EDGAR error:', err)
    res.status(500).json({ error: err.message })
  }
}
