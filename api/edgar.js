const UA = 'AXIOM/1.0 research@axiom.app'

// Module-level cache for the SEC ticker map — identical for every ticker, so
// re-downloading it (200KB–1MB) on each request is pure waste. Persists across
// warm serverless invocations; TTL guards against the map going stale (~daily).
let _tickerMapCache = null
let _tickerMapAt = 0
const TICKER_MAP_TTL = 6 * 60 * 60 * 1000 // 6h

async function getTickerMap() {
  if (_tickerMapCache && Date.now() - _tickerMapAt < TICKER_MAP_TTL) {
    return _tickerMapCache
  }
  const res = await fetch('https://www.sec.gov/files/company_tickers_exchange.json', {
    headers: { 'User-Agent': UA },
  })
  if (!res.ok) throw new Error('Failed to reach SEC EDGAR')
  const map = await res.json()
  _tickerMapCache = map
  _tickerMapAt = Date.now()
  return map
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { ticker } = req.query
  if (!ticker) return res.status(400).json({ error: 'ticker required' })

  try {
    const t = ticker.trim().toUpperCase()

    // Use the company_tickers_exchange.json (smaller, ~200KB vs 1MB for company_tickers.json)
    // Served from module cache after the first request on a warm instance.
    const tickerMap = await getTickerMap()

    let cik = null
    let companyName = t
    // company_tickers_exchange.json has { fields: [...], data: [[cik, name, ticker, exchange], ...] }
    const fields = tickerMap.fields || []
    const rows = tickerMap.data || []
    const cikIdx = fields.indexOf('cik')
    const nameIdx = fields.indexOf('name')
    const tickerIdx = fields.indexOf('ticker')

    if (cikIdx >= 0 && tickerIdx >= 0) {
      for (const row of rows) {
        if (String(row[tickerIdx]).toUpperCase() === t) {
          cik = String(row[cikIdx]).padStart(10, '0')
          companyName = nameIdx >= 0 ? row[nameIdx] : t
          break
        }
      }
    }

    // Fallback to company_tickers.json if not found
    if (!cik) {
      const fallbackRes = await fetch('https://www.sec.gov/files/company_tickers.json', {
        headers: { 'User-Agent': UA },
      })
      if (fallbackRes.ok) {
        const fallback = await fallbackRes.json()
        for (const entry of Object.values(fallback)) {
          if (entry.ticker?.toUpperCase() === t) {
            cik = String(entry.cik_str).padStart(10, '0')
            companyName = entry.title || t
            break
          }
        }
      }
    }

    if (!cik) return res.status(404).json({ error: `Ticker "${t}" not found in SEC EDGAR` })

    // Fetch XBRL company facts
    const factsRes = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, {
      headers: { 'User-Agent': UA },
    })
    if (!factsRes.ok) return res.status(502).json({ error: 'Failed to fetch EDGAR company facts' })
    const facts = await factsRes.json()
    const gaap = facts.facts?.['us-gaap'] || {}

    // Pull latest N annual values for a concept, trying multiple fallback names
    function annualValues(concepts, unit = 'USD', n = 5) {
      for (const concept of [].concat(concepts)) {
        const data = gaap[concept]?.units?.[unit]
        if (!data) continue
        const rows = data
          .filter(d => {
            if (d.form !== '10-K' || d.val == null || !d.end) return false
            if (d.start) {
              const days = (new Date(d.end) - new Date(d.start)) / 86400000
              if (days < 300 || days > 400) return false
            }
            return true
          })
          .sort((a, b) => b.end.localeCompare(a.end))
        // Deduplicate by fiscal year end (keep first/latest filing for each end date)
        const seen = new Set()
        const deduped = rows.filter(d => {
          if (seen.has(d.end)) return false
          seen.add(d.end)
          return true
        })
        if (deduped.length > 0) return deduped.slice(0, n).map(d => ({ val: d.val, end: d.end }))
      }
      return []
    }

    function latest(concepts, unit = 'USD') {
      return annualValues(concepts, unit, 1)[0]?.val ?? null
    }

    function latestN(concepts, unit = 'USD', n = 3) {
      return annualValues(concepts, unit, n).map(d => d.val)
    }

    // Returns [currentYearVal, priorYearVal] for YoY score calculations
    function latestTwo(concepts, unit = 'USD') {
      const vals = annualValues(concepts, unit, 2).map(d => d.val)
      return [vals[0] ?? null, vals[1] ?? null]
    }

    // Income statement
    const revenues = latestN(['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax'], 'USD', 4)
    const revenue = revenues[0] ?? null
    const prevRevenue = revenues[1] ?? null
    const revenue2yAgo = revenues[2] ?? null

    const costOfRevenue = latest(['CostOfRevenue', 'CostOfGoodsAndServicesSold', 'CostOfGoodsSold'])
    const grossProfitDirect = latest(['GrossProfit'])
    const grossProfit = grossProfitDirect ?? (revenue != null && costOfRevenue != null ? revenue - costOfRevenue : null)
    const operatingIncome = latest(['OperatingIncomeLoss'])
    const netIncome = latest(['NetIncomeLoss'])
    const ebit = operatingIncome
    const da = latest(['DepreciationDepletionAndAmortization', 'DepreciationAndAmortization'])
    const ebitda = (ebit != null && da != null) ? ebit + da : (ebit ?? null)
    const eps = latest(['EarningsPerShareBasic', 'EarningsPerShareDiluted'], 'USD/shares')
    const interestExpense = latest(['InterestExpense', 'InterestAndDebtExpense'])

    // Balance sheet
    const cash = latest(['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsAndShortTermInvestments'])
    const totalAssets = latest(['Assets'])
    const totalLiabilities = latest(['Liabilities'])
    const totalEquity = latest(['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'])
    const longTermDebt = latest(['LongTermDebt', 'LongTermDebtNoncurrent'])
    const shortTermDebt = latest(['ShortTermBorrowings', 'DebtCurrent', 'LongTermDebtCurrent'])
    const totalDebt = (longTermDebt ?? 0) + (shortTermDebt ?? 0) || longTermDebt
    const goodwill = latest(['Goodwill'])
    const inventory = latest(['InventoryNet'])
    const currentAssets = latest(['AssetsCurrent'])
    const currentLiabilities = latest(['LiabilitiesCurrent'])
    const retainedEarnings = latest(['RetainedEarningsAccumulatedDeficit'])
    const workingCapital = currentAssets != null && currentLiabilities != null ? currentAssets - currentLiabilities : null

    // Cash flow
    const operatingCF = latest(['NetCashProvidedByUsedInOperatingActivities'])
    const capex = latest(['PaymentsToAcquirePropertyPlantAndEquipment'])
    const fcf = operatingCF != null && capex != null ? operatingCF - capex : null
    const dividendsPaid = latest(['PaymentsOfDividends', 'PaymentsOfDividendsCommonStock'])
    const shareRepurchases = latest(['PaymentsForRepurchaseOfCommonStock'])

    // Shares
    const sharesDiluted = latest(['CommonStockSharesOutstanding', 'WeightedAverageNumberOfDilutedSharesOutstanding'], 'shares')
    const sharesBasic = latest(['WeightedAverageNumberOfSharesOutstandingBasic'], 'shares')
    const shares = sharesDiluted ?? sharesBasic

    // Operating expenses (detail)
    const rnd = latest(['ResearchAndDevelopmentExpense'])
    const sga = latest(['SellingGeneralAndAdministrativeExpense', 'GeneralAndAdministrativeExpense'])
    const sbc = latest(['ShareBasedCompensation', 'AllocatedShareBasedCompensationExpense'])
    const ppe = latest(['PropertyPlantAndEquipmentNet'])
    const incomeTax = latest(['IncomeTaxesPaid', 'IncomeTaxExpenseBenefit'])
    const preTaxIncome = latest(['IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest'])
    const impliedTaxRate = preTaxIncome && incomeTax && preTaxIncome > 0 ? incomeTax / preTaxIncome : null
    const employees = latest(['EntityNumberOfEmployees'], 'pure')
    const revenuePerEmployee = revenue && employees ? revenue / employees : null
    // SBC-adjusted FCF (what sophisticated investors use)
    const fcfExSbc = fcf != null && sbc != null ? fcf - sbc : null

    // ── Prior-year values for Piotroski F-Score (YoY comparisons) ──
    const [, pNetIncome] = latestTwo(['NetIncomeLoss'])
    const [, pTotalAssets] = latestTwo(['Assets'])
    const [, pOperatingCF] = latestTwo(['NetCashProvidedByUsedInOperatingActivities'])
    const [, pLongTermDebt] = latestTwo(['LongTermDebt', 'LongTermDebtNoncurrent'])
    const [, pCurrentAssets] = latestTwo(['AssetsCurrent'])
    const [, pCurrentLiabilities] = latestTwo(['LiabilitiesCurrent'])
    const [, pRevenue] = latestTwo(['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax'])
    const [, pGrossProfitDirect] = latestTwo(['GrossProfit'])
    const [, pCostOfRevenue] = latestTwo(['CostOfRevenue', 'CostOfGoodsAndServicesSold', 'CostOfGoodsSold'])
    const pGrossProfit = pGrossProfitDirect ?? (pRevenue != null && pCostOfRevenue != null ? pRevenue - pCostOfRevenue : null)
    const sharesPrior = latestTwo(['CommonStockSharesOutstanding', 'WeightedAverageNumberOfDilutedSharesOutstanding'], 'shares')[1]
      ?? latestTwo(['WeightedAverageNumberOfSharesOutstandingBasic'], 'shares')[1]

    const prior = {
      netIncome: pNetIncome,
      totalAssets: pTotalAssets,
      operatingCF: pOperatingCF,
      longTermDebt: pLongTermDebt,
      currentAssets: pCurrentAssets,
      currentLiabilities: pCurrentLiabilities,
      currentRatio: pCurrentAssets && pCurrentLiabilities ? pCurrentAssets / pCurrentLiabilities : null,
      revenue: pRevenue,
      grossMargin: pRevenue && pGrossProfit != null ? pGrossProfit / pRevenue : null,
      assetTurnover: pRevenue && pTotalAssets ? pRevenue / pTotalAssets : null,
      shares: sharesPrior,
    }

    // ── Live stock price (Yahoo Finance, free, no key) ──
    let price = null
    let marketCap = null
    try {
      const yf = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${t}?interval=1d&range=1d`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      })
      if (yf.ok) {
        const yfData = await yf.json()
        const meta = yfData?.chart?.result?.[0]?.meta
        price = meta?.regularMarketPrice ?? null
        if (price != null && shares != null) marketCap = price * shares
      }
    } catch { /* price is best-effort; non-fatal */ }

    // Derived metrics
    const revenueGrowth = revenue != null && prevRevenue != null && prevRevenue !== 0
      ? (revenue - prevRevenue) / Math.abs(prevRevenue) : null
    const revenueGrowth2y = revenue != null && revenue2yAgo != null && revenue2yAgo !== 0
      ? (revenue - revenue2yAgo) / Math.abs(revenue2yAgo) / 2 : null  // CAGR approx
    const grossMargin = revenue && grossProfit != null ? grossProfit / revenue : null
    const ebitdaMargin = revenue && ebitda != null ? ebitda / revenue : null
    const operatingMargin = revenue && operatingIncome != null ? operatingIncome / revenue : null
    const netMargin = revenue && netIncome != null ? netIncome / revenue : null
    const netDebt = totalDebt != null && cash != null ? totalDebt - cash : null
    const roe = totalEquity && netIncome ? netIncome / totalEquity : null
    const roa = totalAssets && netIncome ? netIncome / totalAssets : null
    const currentRatio = currentAssets && currentLiabilities ? currentAssets / currentLiabilities : null
    const debtToEquity = totalDebt && totalEquity ? totalDebt / totalEquity : null
    const interestCoverage = interestExpense && ebit ? ebit / interestExpense : null
    const fcfMargin = revenue && fcf != null ? fcf / revenue : null
    const revenueHistory = revenues

    // Fundamentals change only on new filings (quarterly), but this response
    // also embeds the live price, so we cap freshness at 15min: popular tickers
    // (AAPL, NVDA, ...) get ~1 EDGAR fetch per 15min instead of one per request
    // — a >99% load reduction at any real volume — while the price stays fresh
    // enough for a research note. 1h stale-while-revalidate hides cold fetches.
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600')
    res.status(200).json({
      financials: {
        ticker: t,
        companyName,
        cik,
        // Income
        revenue,
        prevRevenue,
        revenueHistory,
        revenueGrowth,
        revenueGrowth2y,
        grossProfit,
        grossMargin,
        ebit,
        ebitda,
        ebitdaMargin,
        operatingIncome,
        operatingMargin,
        netIncome,
        netMargin,
        eps,
        da,
        interestExpense,
        // Balance sheet
        cash,
        totalAssets,
        totalLiabilities,
        totalEquity,
        longTermDebt,
        shortTermDebt,
        totalDebt,
        netDebt,
        goodwill,
        inventory,
        currentAssets,
        currentLiabilities,
        currentRatio,
        debtToEquity,
        interestCoverage,
        roe,
        roa,
        retainedEarnings,
        workingCapital,
        // Operating expenses (detail)
        rnd,
        sga,
        sbc,
        ppe,
        impliedTaxRate,
        employees,
        revenuePerEmployee,
        // Cash flow
        operatingCF,
        capex,
        fcf,
        fcfMargin,
        fcfExSbc,
        dividendsPaid,
        shareRepurchases,
        // Shares
        shares,
        // Market data
        price,
        marketCap,
        // Prior-year snapshot for scoring
        prior,
      },
    })
  } catch (err) {
    console.error('EDGAR error:', err)
    res.status(500).json({ error: err.message })
  }
}
