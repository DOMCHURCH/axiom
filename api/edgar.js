import { getQuote } from './_prices.js'

const UA = 'AXIOM/1.0 research@axiom.app'

// Module-level cache for the SEC ticker map — identical for every ticker, so
// re-downloading it (200KB–1MB) on each request is pure waste. Persists across
// warm serverless invocations; TTL guards against the map going stale (~daily).
let _tickerMapCache = null
let _tickerMapAt = 0
let _fallbackMapCache = null
let _fallbackMapAt = 0
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

async function getFallbackMap() {
  if (_fallbackMapCache && Date.now() - _fallbackMapAt < TICKER_MAP_TTL) {
    return _fallbackMapCache
  }
  const res = await fetch('https://www.sec.gov/files/company_tickers.json', {
    headers: { 'User-Agent': UA },
  })
  if (!res.ok) return null
  const map = await res.json()
  _fallbackMapCache = map
  _fallbackMapAt = Date.now()
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
    // Validate shape before it ever reaches an outbound URL — blocks path
    // injection (e.g. "AAPL/../v7/...") into the Yahoo request and bad lookups.
    if (!/^[A-Z][A-Z.\-]{0,11}$/.test(t)) {
      return res.status(400).json({ error: `Invalid ticker "${ticker}"` })
    }

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

    // Fallback to company_tickers.json if not found (module-level cached)
    if (!cik) {
      const fallback = await getFallbackMap()
      if (fallback) {
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
          // Sort by period end (newest first), then by FILING date (newest first)
          // so that for any restated/re-presented year we keep the most recent
          // figure rather than the original — matches what a 10-K reader sees.
          .sort((a, b) => b.end.localeCompare(a.end) || (b.filed || '').localeCompare(a.filed || ''))
        // Deduplicate by fiscal year end (keep latest-filed value for each end date)
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

    // ── 10-Q fallback for recent IPOs / companies with no 10-K yet ──
    // Only kicks in when there is no annual data at all. Balance-sheet items
    // (instant facts, no start date) take the latest 10-Q value; flow items
    // are annualized from up to the last 4 distinct quarters.
    const REV_CONCEPTS = ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax']
    const useQuarterly = latest(REV_CONCEPTS) == null && latest(['Assets']) == null
    let quartersUsed = 0
    function qLatest(concepts, unit = 'USD') {
      const a = latest(concepts, unit)
      if (a != null || !useQuarterly) return a
      for (const concept of [].concat(concepts)) {
        const data = gaap[concept]?.units?.[unit]
        if (!data) continue
        const isQ = d => d.val != null && d.end && /^10-[QK]/.test(d.form || '')
        const byRecency = (x, y) => y.end.localeCompare(x.end) || (y.filed || '').localeCompare(x.filed || '')
        // Instant (balance-sheet) facts: latest point-in-time value
        const inst = data.filter(d => isQ(d) && !d.start).sort(byRecency)
        if (inst.length) return inst[0].val
        // Flow facts: sum distinct single quarters, annualize
        const qs = data.filter(d => {
          if (!isQ(d) || !d.start) return false
          const days = (new Date(d.end) - new Date(d.start)) / 86400000
          return days >= 75 && days <= 105
        }).sort(byRecency)
        const seen = new Set()
        const deduped = qs.filter(d => (seen.has(d.end) ? false : (seen.add(d.end), true))).slice(0, 4)
        if (deduped.length) {
          quartersUsed = Math.max(quartersUsed, deduped.length)
          return deduped.reduce((s, d) => s + d.val, 0) * (4 / deduped.length)
        }
      }
      return null
    }

    // Income statement
    const revenues = latestN(REV_CONCEPTS, 'USD', 4)
    const revenue = revenues[0] ?? qLatest(REV_CONCEPTS)
    const prevRevenue = revenues[1] ?? null
    const revenue2yAgo = revenues[2] ?? null

    const costOfRevenue = qLatest(['CostOfRevenue', 'CostOfGoodsAndServicesSold', 'CostOfGoodsSold'])
    const grossProfitDirect = qLatest(['GrossProfit'])
    const grossProfit = grossProfitDirect ?? (revenue != null && costOfRevenue != null ? revenue - costOfRevenue : null)
    const operatingIncome = qLatest(['OperatingIncomeLoss'])
    const netIncome = qLatest(['NetIncomeLoss'])
    const ebit = operatingIncome
    const da = qLatest(['DepreciationDepletionAndAmortization', 'DepreciationAndAmortization'])
    const ebitda = (ebit != null && da != null) ? ebit + da : (ebit ?? null)
    // Diluted first — the conservative, valuation-standard figure (basic only as fallback)
    const eps = qLatest(['EarningsPerShareDiluted', 'EarningsPerShareBasic'], 'USD/shares')
    const interestExpense = qLatest(['InterestExpense', 'InterestAndDebtExpense'])

    // Balance sheet
    const cash = qLatest(['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsAndShortTermInvestments'])
    const totalAssets = qLatest(['Assets'])
    const totalLiabilities = qLatest(['Liabilities'])
    const totalEquity = qLatest(['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'])
    const longTermDebt = qLatest(['LongTermDebt', 'LongTermDebtNoncurrent'])
    const shortTermDebt = qLatest(['ShortTermBorrowings', 'DebtCurrent', 'LongTermDebtCurrent'])
    const totalDebt = (longTermDebt ?? 0) + (shortTermDebt ?? 0) || longTermDebt
    const goodwill = qLatest(['Goodwill'])
    const inventory = qLatest(['InventoryNet'])
    const currentAssets = qLatest(['AssetsCurrent'])
    const currentLiabilities = qLatest(['LiabilitiesCurrent'])
    const retainedEarnings = qLatest(['RetainedEarningsAccumulatedDeficit'])
    const workingCapital = currentAssets != null && currentLiabilities != null ? currentAssets - currentLiabilities : null

    // Cash flow
    const operatingCF = qLatest(['NetCashProvidedByUsedInOperatingActivities'])
    const capex = qLatest(['PaymentsToAcquirePropertyPlantAndEquipment'])
    const fcf = operatingCF != null && capex != null ? operatingCF - capex : null
    const dividendsPaid = qLatest(['PaymentsOfDividends', 'PaymentsOfDividendsCommonStock'])
    const shareRepurchases = qLatest(['PaymentsForRepurchaseOfCommonStock'])

    // Shares
    const sharesDiluted = qLatest(['CommonStockSharesOutstanding', 'WeightedAverageNumberOfDilutedSharesOutstanding'], 'shares')
    const sharesBasic = qLatest(['WeightedAverageNumberOfSharesOutstandingBasic'], 'shares')
    const shares = sharesDiluted ?? sharesBasic

    // Operating expenses (detail)
    const rnd = qLatest(['ResearchAndDevelopmentExpense'])
    const sga = qLatest(['SellingGeneralAndAdministrativeExpense', 'GeneralAndAdministrativeExpense'])
    const sbc = qLatest(['ShareBasedCompensation', 'AllocatedShareBasedCompensationExpense'])
    const ppe = qLatest(['PropertyPlantAndEquipmentNet'])
    const incomeTax = qLatest(['IncomeTaxesPaid', 'IncomeTaxExpenseBenefit'])
    const preTaxIncome = qLatest(['IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest'])
    const impliedTaxRate = preTaxIncome && incomeTax && preTaxIncome > 0 ? incomeTax / preTaxIncome : null
    const employees = qLatest(['EntityNumberOfEmployees'], 'pure')
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

    // ── Live stock price ──
    // Best-effort, and now genuinely so: the fetch is bounded, so a throttled
    // provider that hangs instead of erroring can no longer hold this whole
    // request (filings and all) hostage until the 30s function budget expires.
    // `priceSource` is null when nothing answered, so the client can label the
    // valuation as filing-only rather than implying a live mark.
    let price = null
    let marketCap = null
    let priceSource = null
    try {
      const { quote, source } = await getQuote(t)
      price = quote?.price ?? null
      priceSource = source
      if (price != null && shares != null) marketCap = price * shares
    } catch { /* price is best-effort; non-fatal */ }

    // Derived metrics
    const revenueGrowth = revenue != null && prevRevenue != null && prevRevenue !== 0
      ? (revenue - prevRevenue) / Math.abs(prevRevenue) : null
    // True 2-year revenue CAGR (requires positive endpoints for a real compound rate)
    const revenueGrowth2y = revenue != null && revenue2yAgo != null && revenue2yAgo > 0 && revenue > 0
      ? Math.pow(revenue / revenue2yAgo, 1 / 2) - 1 : null
    const grossMargin = revenue && grossProfit != null ? grossProfit / revenue : null
    const ebitdaMargin = revenue && ebitda != null ? ebitda / revenue : null
    const operatingMargin = revenue && operatingIncome != null ? operatingIncome / revenue : null
    const netMargin = revenue && netIncome != null ? netIncome / revenue : null
    const netDebt = totalDebt != null && cash != null ? totalDebt - cash : null
    const roe = totalEquity && netIncome ? netIncome / totalEquity : null
    const roa = totalAssets && netIncome ? netIncome / totalAssets : null
    const currentRatio = currentAssets && currentLiabilities ? currentAssets / currentLiabilities : null
    const debtToEquity = totalDebt && totalEquity ? totalDebt / totalEquity : null
    // Only meaningful when there's genuine interest expense. Cash-rich firms report
    // net interest *income* (negative expense), which would yield a misleading ratio.
    const interestCoverage = interestExpense > 0 && ebit != null ? ebit / interestExpense : null
    const fcfMargin = revenue && fcf != null ? fcf / revenue : null
    const revenueHistory = revenues

    // Fundamentals change only on new filings (quarterly), but this response
    // also embeds the live price, so we cap freshness at 15min: popular tickers
    // (AAPL, NVDA, ...) get ~1 EDGAR fetch per 15min instead of one per request
    // — a >99% load reduction at any real volume — while the price stays fresh
    // enough for a research note. 1h stale-while-revalidate hides cold fetches.
    //
    // When the price didn't resolve, cache for 60s instead: the filings half is
    // still worth serving, but pinning a price-less response for 15 minutes
    // would outlast the throttle that caused it and make a transient block look
    // like a permanent one.
    res.setHeader(
      'Cache-Control',
      price != null
        ? 's-maxage=900, stale-while-revalidate=3600'
        : 's-maxage=60, stale-while-revalidate=300'
    )
    res.status(200).json({
      financials: {
        ticker: t,
        companyName,
        cik,
        // 'annual' (10-K) or 'quarterly' (annualized from 10-Qs — recent IPO)
        dataBasis: useQuarterly && quartersUsed > 0 ? 'quarterly' : 'annual',
        quartersUsed: useQuarterly ? quartersUsed : null,
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
        // Which provider answered ('fmp' | 'polygon' | 'yahoo' | 'cache'), or
        // null when none did — price and marketCap are then null, not stale.
        priceSource,
        // Prior-year snapshot for scoring
        prior,
      },
    })
  } catch (err) {
    console.error('EDGAR error:', err)
    res.status(500).json({ error: err.message })
  }
}
