// AXIOM — Investor-grade PDF export using jsPDF vector text/shapes
// No html2canvas — pure vector output

import { runDCF, monteCarloDCF } from './dcf.js'

// Normalize a rate the AI may have returned as a whole-number percent
function normRate(v, fallback) {
  if (v == null || isNaN(v)) return fallback
  return Math.abs(v) > 1 ? v / 100 : v
}

// Convert bare decimals in AI prose to formatted percentages (matches web report)
// Negative lookahead (?!%) prevents double-converting already-formatted values like "0.8%"
function fixProse(text) {
  if (!text || typeof text !== 'string') return text
  return text.replace(/\b(0\.\d{1,4})\b(?!%)/g, (m, num) => {
    const val = parseFloat(num)
    if (val >= 0.01 && val <= 0.99) {
      const p = val * 100
      return (p % 1 === 0 ? p.toFixed(0) : p.toFixed(1)) + '%'
    }
    return m
  })
}

export async function exportReportPDF(ticker, report, financials) {
  const { default: jsPDF } = await import('jspdf')

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const PW = 210
  const MARGIN = 15
  const CW = PW - MARGIN * 2  // content width = 180mm

  const date = new Date().toISOString().slice(0, 10)

  // ── Colors ────────────────────────────────────────────────────────────────
  const C = {
    headerBg:  [10, 22, 40],
    white:     [255, 255, 255],
    blue:      [14, 165, 233],
    blueLight: [125, 211, 252],
    green:     [5, 150, 105],
    red:       [220, 38, 38],
    amber:     [245, 158, 11],
    dark:      [15, 23, 42],
    muted:     [100, 116, 139],
    lightBg:   [248, 250, 252],
    border:    [226, 232, 240],
  }

  // ── State ─────────────────────────────────────────────────────────────────
  let y = 0

  function addPage() {
    pdf.addPage()
    y = 20
  }

  function checkPage(needed) {
    if (y + needed > 282) addPage()
  }

  // ── Color helpers ──────────────────────────────────────────────────────────
  function setFill(c) { pdf.setFillColor(c[0], c[1], c[2]) }
  function setDraw(c) { pdf.setDrawColor(c[0], c[1], c[2]) }
  function setTxt(c)  { pdf.setTextColor(c[0], c[1], c[2]) }

  // ── Text helpers ───────────────────────────────────────────────────────────
  function wrappedText(text, x, wx, wy, maxW, fontSize, color, fontStyle = 'normal', fontName = 'helvetica') {
    pdf.setFont(fontName, fontStyle)
    pdf.setFontSize(fontSize)
    setTxt(color)
    const lines = pdf.splitTextToSize(String(text || ''), maxW)
    pdf.text(lines, x, wy)
    return wy + lines.length * (fontSize * 0.3528 + 1.2)
  }

  function sectionLabel(text) {
    checkPage(12)
    // Blue thin line
    setDraw(C.blue)
    pdf.setLineWidth(0.3)
    pdf.line(MARGIN, y, MARGIN + CW, y)
    y += 4
    // Label with spaced letters
    const spaced = text.split('').join('  ')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7)
    setTxt(C.blue)
    pdf.text(spaced, MARGIN, y)
    y += 5
  }

  function metricBox(bx, by, bw, bh, label, value, valueColor) {
    setFill(C.lightBg)
    setDraw(C.border)
    pdf.setLineWidth(0.2)
    pdf.roundedRect(bx, by, bw, bh, 1, 1, 'FD')
    // Label
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(6)
    setTxt(C.muted)
    pdf.text(String(label).toUpperCase(), bx + 3, by + 4.5)
    // Value
    pdf.setFont('courier', 'bold')
    pdf.setFontSize(10)
    setTxt(valueColor || C.dark)
    pdf.text(String(value), bx + 3, by + bh - 3.5)
  }

  function dataRow(ry, cols, widths, isHeader) {
    if (isHeader) {
      setFill(C.headerBg)
      pdf.rect(MARGIN, ry - 4, CW, 7, 'F')
    } else {
      setFill(ry % 2 === 0 ? C.lightBg : C.white)
      pdf.rect(MARGIN, ry - 4, CW, 6.5, 'F')
    }
    pdf.setFont('helvetica', isHeader ? 'bold' : 'normal')
    pdf.setFontSize(isHeader ? 7 : 8)
    setTxt(isHeader ? C.white : C.dark)
    let cx = MARGIN + 2
    cols.forEach((col, i) => {
      pdf.text(String(col || ''), cx, ry)
      cx += widths[i]
    })
    return ry + (isHeader ? 7 : 6.5)
  }

  // ── Formatting helpers ─────────────────────────────────────────────────────
  const fmt = {
    currency: v => {
      if (v == null) return 'N/A'
      const abs = Math.abs(v)
      const sign = v < 0 ? '-' : ''
      if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(1)}T`
      if (abs >= 1e9)  return `${sign}$${(abs / 1e9).toFixed(1)}B`
      if (abs >= 1e6)  return `${sign}$${(abs / 1e6).toFixed(1)}M`
      return `${sign}$${abs.toFixed(0)}`
    },
    pct: v => v == null ? 'N/A' : `${(v * 100).toFixed(1)}%`,
    num: v => v == null ? 'N/A' : v.toFixed(2),
    price: v => v == null ? 'N/A' : `$${v.toFixed(2)}`,
  }

  // ── Extract data ───────────────────────────────────────────────────────────
  const s = report?.structured || {}
  const rec = s.recommendation || 'HOLD'
  const moat = s.moatRating || s.moat || 'NARROW'
  const targetPrice = s.targetPrice
  const risks = s.risks || []
  const bulls = s.bullCase || []
  const bears = s.bearCase || []
  const f = financials || {}

  // ── Compute the DCF here (same logic as the on-screen report) ──────────────
  // The structured AI output does NOT contain a computed DCF — it only carries
  // assumptions. We derive intrinsic value, EV, terminal value, etc. ourselves.
  const fcf = f.fcf || (f.operatingCF ? f.operatingCF * 0.85 : null)
  const dcfIn = {
    fcf,
    nearTermGrowth: normRate(s.dcfAssumptions?.nearTermGrowth, 0.08),
    longTermGrowth: normRate(s.dcfAssumptions?.longTermGrowth, 0.05),
    terminalGrowth: normRate(s.dcfAssumptions?.terminalGrowthRate, 0.025),
    wacc: normRate(s.dcfAssumptions?.wacc, 0.09),
    shares: f.shares,
    netDebt: f.netDebt,
  }
  const dcfRes = fcf ? runDCF(dcfIn) : null
  const currentPrice = f.price ?? s.currentPrice ?? null
  const mc = fcf && f.shares ? monteCarloDCF(dcfIn, currentPrice) : null

  // Shape the computed DCF into the fields the renderer below expects
  const dcf = dcfRes ? {
    intrinsicValue: dcfRes.intrinsicValue,
    enterpriseValue: dcfRes.enterpriseValue,
    terminalValuePct: dcfRes.tvAsPctOfEV != null ? dcfRes.tvAsPctOfEV * 100 : null,
    projectedFCFs: dcfRes.projectedFCF,
    assumptions: {
      wacc: dcfIn.wacc,
      nearTermGrowth: dcfIn.nearTermGrowth,
      longTermGrowth: dcfIn.longTermGrowth,
      terminalGrowth: dcfIn.terminalGrowth,
    },
  } : {}

  // ── Normalize comps to canonical field names (peRatio/revenueGrowth) ───────
  const comps = (s.comps || []).map(c => ({
    ticker: c.ticker,
    name: c.name,
    evEbitda: c.evEbitda != null && c.evEbitda > 0 && c.evEbitda < 200 ? c.evEbitda : null,
    pe: (c.peRatio ?? c.pe) != null && (c.peRatio ?? c.pe) > 0 && (c.peRatio ?? c.pe) < 500 ? (c.peRatio ?? c.pe) : null,
    revGrowth: normRate(c.revenueGrowth ?? c.revGrowth, null),
    grossMargin: (c.grossMargin != null) ? (Math.abs(c.grossMargin) > 1 ? c.grossMargin / 100 : c.grossMargin) : null,
  }))

  const recColor = { BUY: C.green, SELL: C.red, HOLD: C.amber }[rec] || C.amber
  const upside = targetPrice && f.price ? ((targetPrice - f.price) / f.price * 100).toFixed(1) : null

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 1
  // ══════════════════════════════════════════════════════════════════════════

  // ── Header bar ────────────────────────────────────────────────────────────
  setFill(C.headerBg)
  pdf.rect(0, 0, PW, 28, 'F')

  // AXIOM logo
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(14)
  setTxt(C.blue)
  pdf.text('AXIOM', MARGIN, 11)

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7)
  setTxt(C.blueLight)
  pdf.text('EQUITY RESEARCH', MARGIN, 17)

  // Right side: ticker + rec badge + moat badge
  const tickerW = pdf.getTextWidth(ticker) + 2
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(14)
  setTxt(C.white)
  pdf.text(ticker, PW - MARGIN - tickerW - 54, 12)

  // Rec badge
  const recX = PW - MARGIN - 48
  setFill(recColor)
  pdf.roundedRect(recX, 5, 20, 8, 1, 1, 'F')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(7)
  setTxt(C.white)
  pdf.text(rec, recX + 10 - pdf.getTextWidth(rec) / 2, 10.5)

  // Moat badge
  const moatX = recX + 23
  setFill(C.blue)
  pdf.roundedRect(moatX, 5, 20, 8, 1, 1, 'F')
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7)
  setTxt(C.white)
  pdf.text(moat, moatX + 10 - pdf.getTextWidth(moat) / 2, 10.5)

  // MOAT label above badge area
  pdf.setFontSize(5.5)
  setTxt(C.blueLight)
  pdf.text('MOAT', moatX + 10 - pdf.getTextWidth('MOAT') / 2, 20)
  pdf.text('RATING', recX + 10 - pdf.getTextWidth('RATING') / 2, 20)

  y = 32

  // ── Company info + price panel ─────────────────────────────────────────────
  const leftW = CW * 0.58
  const rightX = MARGIN + leftW + 6
  const rightW = CW - leftW - 6

  // Company name
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(11)
  setTxt(C.dark)
  const compName = f.companyName || ticker
  const compLines = pdf.splitTextToSize(compName, leftW)
  pdf.text(compLines.slice(0, 1), MARGIN, y + 6)

  // Date / source
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7.5)
  setTxt(C.muted)
  pdf.text(`SEC EDGAR  ·  ${date}`, MARGIN, y + 12)

  // Description
  if (report?.companyDescription || s.companyDescription) {
    const desc = report?.companyDescription || s.companyDescription || ''
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    setTxt(C.dark)
    const descLines = pdf.splitTextToSize(desc, leftW)
    pdf.text(descLines.slice(0, 2), MARGIN, y + 18)
  }

  // Right: price panel
  if (f.price != null) {
    pdf.setFont('courier', 'bold')
    pdf.setFontSize(18)
    setTxt(C.dark)
    pdf.text(fmt.price(f.price), rightX, y + 8)

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    setTxt(C.muted)
    pdf.text('LIVE PRICE', rightX, y + 13)

    if (f.marketCap) {
      pdf.setFont('courier', 'normal')
      pdf.setFontSize(8.5)
      setTxt(C.dark)
      pdf.text(fmt.currency(f.marketCap), rightX, y + 20)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7)
      setTxt(C.muted)
      pdf.text('MARKET CAP', rightX, y + 24.5)
    }
  }

  if (targetPrice) {
    const tpX = rightX + (rightW / 2)
    pdf.setFont('courier', 'bold')
    pdf.setFontSize(18)
    setTxt(C.blue)
    pdf.text(fmt.price(targetPrice), tpX, y + 8)

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    setTxt(C.muted)
    pdf.text('12M TARGET', tpX, y + 13)

    if (upside != null) {
      const uColor = parseFloat(upside) >= 0 ? C.green : C.red
      setTxt(uColor)
      pdf.setFontSize(8.5)
      pdf.setFont('courier', 'bold')
      pdf.text(`${upside > 0 ? '+' : ''}${upside}%`, tpX, y + 20)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7)
      setTxt(C.muted)
      pdf.text('UPSIDE', tpX, y + 24.5)
    }
  }

  y += 34

  // Thin separator
  setDraw(C.border)
  pdf.setLineWidth(0.2)
  pdf.line(MARGIN, y, MARGIN + CW, y)
  y += 6

  // ── Executive Summary ──────────────────────────────────────────────────────
  sectionLabel('EXECUTIVE SUMMARY')
  if (s.executiveSummary) {
    checkPage(20)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    setTxt(C.dark)
    const lines = pdf.splitTextToSize(fixProse(s.executiveSummary), CW)
    pdf.text(lines, MARGIN, y)
    y += lines.length * 4.5 + 4
  }

  // ── Key Financial Metrics — 2×4 grid ──────────────────────────────────────
  checkPage(38)
  sectionLabel('KEY FINANCIAL METRICS')

  const metrics = [
    ['Revenue TTM',   fmt.currency(f.revenue),      null],
    ['Gross Margin',  fmt.pct(f.grossMargin),        f.grossMargin != null ? (f.grossMargin > 0.4 ? C.green : C.amber) : null],
    ['EBITDA Margin', fmt.pct(f.ebitdaMargin),       f.ebitdaMargin != null ? (f.ebitdaMargin > 0.15 ? C.green : C.amber) : null],
    ['FCF Margin',    fmt.pct(f.fcfMargin),          f.fcfMargin != null ? (f.fcfMargin > 0.1 ? C.green : f.fcfMargin < 0 ? C.red : C.amber) : null],
    ['Free Cash Flow',fmt.currency(f.fcf),           f.fcf != null ? (f.fcf > 0 ? C.green : C.red) : null],
    ['Net Income',    fmt.currency(f.netIncome),     f.netIncome != null ? (f.netIncome > 0 ? C.green : C.red) : null],
    ['Net Debt',      fmt.currency(f.netDebt),       null],
    ['ROE',           fmt.pct(f.roe),                f.roe != null ? (f.roe > 0.15 ? C.green : C.amber) : null],
  ]

  const boxW = (CW - 6) / 4
  const boxH = 14
  const boxGap = 2
  metrics.forEach((m, i) => {
    const col = i % 4
    const row = Math.floor(i / 4)
    const bx = MARGIN + col * (boxW + boxGap)
    const by = y + row * (boxH + boxGap)
    metricBox(bx, by, boxW, boxH, m[0], m[1], m[2] || C.dark)
  })
  y += 2 * (boxH + boxGap) + 4

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 2
  // ══════════════════════════════════════════════════════════════════════════
  addPage()

  // ── Investment Thesis ──────────────────────────────────────────────────────
  sectionLabel('INVESTMENT THESIS')
  if (s.investmentThesis) {
    checkPage(20)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    setTxt(C.dark)
    const lines = pdf.splitTextToSize(fixProse(s.investmentThesis), CW)
    pdf.text(lines, MARGIN, y)
    y += lines.length * 4.5 + 4
  }

  // ── Bull / Bear ────────────────────────────────────────────────────────────
  checkPage(40)
  sectionLabel('INVESTMENT CASE')

  const caseW = (CW - 8) / 2
  const bullX = MARGIN
  const bearX = MARGIN + caseW + 8

  // Bull header
  setFill(C.green)
  pdf.roundedRect(bullX, y, caseW, 6, 1, 1, 'F')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(7)
  setTxt(C.white)
  pdf.text('BULL CASE', bullX + 3, y + 4.2)

  // Bear header
  setFill(C.red)
  pdf.roundedRect(bearX, y, caseW, 6, 1, 1, 'F')
  pdf.text('BEAR CASE', bearX + 3, y + 4.2)
  y += 8

  const bullStart = y
  const bearStart = y

  // Bull bullets
  let bullY = bullStart
  bulls.slice(0, 3).forEach(pt => {
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8.5)
    setTxt(C.green)
    pdf.text('▸', bullX, bullY)
    setTxt(C.dark)
    const lines = pdf.splitTextToSize(fixProse(String(pt)), caseW - 6)
    pdf.text(lines, bullX + 4, bullY)
    bullY += lines.length * 4 + 2
  })

  // Bear bullets
  let bearY = bearStart
  bears.slice(0, 3).forEach(pt => {
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8.5)
    setTxt(C.red)
    pdf.text('▸', bearX, bearY)
    setTxt(C.dark)
    const lines = pdf.splitTextToSize(fixProse(String(pt)), caseW - 6)
    pdf.text(lines, bearX + 4, bearY)
    bearY += lines.length * 4 + 2
  })

  y = Math.max(bullY, bearY) + 6

  // ── DCF Valuation ──────────────────────────────────────────────────────────
  checkPage(60)
  sectionLabel('DCF VALUATION MODEL')

  // 4 key stats in a row
  const dcfStats = [
    ['Intrinsic Value / Share', dcf.intrinsicValue ? fmt.price(dcf.intrinsicValue) : 'N/A', C.blue],
    ['Enterprise Value',        dcf.enterpriseValue ? fmt.currency(dcf.enterpriseValue) : 'N/A', C.dark],
    ['WACC',                    dcf.assumptions?.wacc ? fmt.pct(dcf.assumptions.wacc) : 'N/A', C.dark],
    ['Terminal Value %',        dcf.terminalValuePct ? `${dcf.terminalValuePct.toFixed(1)}%` : 'N/A', C.dark],
  ]

  const statW = (CW - 6) / 4
  const statH = 14
  dcfStats.forEach((stat, i) => {
    const sx = MARGIN + i * (statW + 2)
    metricBox(sx, y, statW, statH, stat[0], stat[1], stat[2])
  })
  y += statH + 4

  // Context note when intrinsic value sits well below market price (common for
  // high-multiple growth names whose price embeds growth beyond the 8Y horizon)
  if (currentPrice && dcf.intrinsicValue && dcf.intrinsicValue < currentPrice * 0.75) {
    checkPage(14)
    const note = `Note: DCF intrinsic value (${fmt.price(dcf.intrinsicValue)}) sits below the market price (${fmt.price(currentPrice)}), typical for high-multiple growth stocks where the market prices in long-duration growth beyond this 8-year model. The 12-month target${targetPrice ? ` (${fmt.price(targetPrice)})` : ''} reflects comps-based and growth-adjusted valuation.`
    pdf.setFont('helvetica', 'italic')
    pdf.setFontSize(7.5)
    setTxt(C.muted)
    const noteLines = pdf.splitTextToSize(note, CW)
    pdf.text(noteLines, MARGIN, y)
    y += noteLines.length * 3.4 + 4
  }

  // Assumptions mini-table
  if (dcf.assumptions) {
    checkPage(24)
    const assumpCols = ['WACC', 'Near-Term Growth', 'Long-Term Growth', 'Terminal Growth']
    const assumpVals = [
      dcf.assumptions.wacc ? fmt.pct(dcf.assumptions.wacc) : 'N/A',
      dcf.assumptions.nearTermGrowth ? fmt.pct(dcf.assumptions.nearTermGrowth) : 'N/A',
      dcf.assumptions.longTermGrowth ? fmt.pct(dcf.assumptions.longTermGrowth) : 'N/A',
      dcf.assumptions.terminalGrowth ? fmt.pct(dcf.assumptions.terminalGrowth) : 'N/A',
    ]
    const colW = CW / 4
    y = dataRow(y, assumpCols, [colW, colW, colW, colW], true)
    y = dataRow(y, assumpVals, [colW, colW, colW, colW], false)
    y += 4
  }

  // Projected FCFs table
  if (dcf.projectedFCFs && dcf.projectedFCFs.length > 0) {
    checkPage(18)
    const fcfs = dcf.projectedFCFs.slice(0, 8)
    const headers = fcfs.map((_, i) => `Year ${i + 1}`)
    const values = fcfs.map(v => fmt.currency(v))
    const colW = CW / fcfs.length
    y = dataRow(y, headers, headers.map(() => colW), true)
    y = dataRow(y, values, headers.map(() => colW), false)
    y += 4
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE 3
  // ══════════════════════════════════════════════════════════════════════════
  addPage()

  // ── Comps table ────────────────────────────────────────────────────────────
  sectionLabel('COMPARABLE COMPANY ANALYSIS')

  if (comps.length > 0) {
    const compWidths = [50, 30, 25, 30, 35]
    const compHeaders = ['Company', 'EV/EBITDA', 'P/E', 'Rev Growth', 'Gross Margin']
    y = dataRow(y, compHeaders, compWidths, true)
    comps.forEach((c, i) => {
      checkPage(8)
      const row = [
        `${c.ticker || ''} ${c.name || ''}`.trim(),
        c.evEbitda != null ? `${c.evEbitda.toFixed(1)}x` : 'N/A',
        c.pe != null ? `${c.pe.toFixed(1)}x` : 'N/A',
        c.revGrowth != null ? fmt.pct(c.revGrowth) : 'N/A',
        c.grossMargin != null ? fmt.pct(c.grossMargin) : 'N/A',
      ]
      y = dataRow(y + (i === 0 ? 0 : 0), row, compWidths, false)
    })
    y += 5
  }

  // ── Risk Matrix ────────────────────────────────────────────────────────────
  checkPage(20)
  sectionLabel('RISK MATRIX')

  risks.slice(0, 6).forEach(risk => {
    checkPage(14)
    const sevColor = { HIGH: C.red, MEDIUM: C.amber, LOW: C.green }[risk.severity?.toUpperCase()] || C.muted

    // Severity badge
    setFill(sevColor)
    pdf.roundedRect(MARGIN, y - 1, 16, 5, 0.8, 0.8, 'F')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(5.5)
    setTxt(C.white)
    const sevLabel = (risk.severity || 'MED').slice(0, 3).toUpperCase()
    pdf.text(sevLabel, MARGIN + 8 - pdf.getTextWidth(sevLabel) / 2, y + 2.5)

    // Category + title
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)
    setTxt(C.dark)
    pdf.text(`${risk.category || ''}: ${risk.title || ''}`, MARGIN + 19, y + 2.5)

    // Description
    if (risk.description) {
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7.5)
      setTxt(C.muted)
      const descLines = pdf.splitTextToSize(fixProse(risk.description), CW - 19)
      pdf.text(descLines, MARGIN + 19, y + 7)
      y += 7 + descLines.length * 3.2 + 2
    } else {
      y += 9
    }
  })

  y += 3

  // ── Analyst Conviction ─────────────────────────────────────────────────────
  checkPage(20)
  sectionLabel('ANALYST CONVICTION')
  const conviction = s.analystNote || s.analystConviction
  if (conviction) {
    pdf.setFont('helvetica', 'italic')
    pdf.setFontSize(9)
    setTxt(C.dark)
    const lines = pdf.splitTextToSize(`"${fixProse(conviction)}"`, CW)
    pdf.text(lines, MARGIN, y)
    y += lines.length * 4.5 + 4
  }

  // ── Footer (on every page) ─────────────────────────────────────────────────
  const totalPages = pdf.internal.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    pdf.setPage(p)

    // Thin line
    setDraw(C.border)
    pdf.setLineWidth(0.2)
    pdf.line(MARGIN, 286, MARGIN + CW, 286)

    // Footer text
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    setTxt(C.muted)
    pdf.text('AXIOM — Equity Research', MARGIN, 290)
    pdf.text(date, PW - MARGIN - pdf.getTextWidth(date), 290)
    pdf.text(`Page ${p} of ${totalPages}`, PW / 2 - pdf.getTextWidth(`Page ${p} of ${totalPages}`) / 2, 290)

    // Disclosure
    pdf.setFontSize(5.5)
    setTxt(C.muted)
    const disc = 'This report is generated by AI using public SEC EDGAR data and is for informational purposes only. Not financial advice. Past performance is not indicative of future results.'
    const discLines = pdf.splitTextToSize(disc, CW)
    pdf.text(discLines, MARGIN, 294)
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  pdf.save(`AXIOM_${ticker}_${date}.pdf`)
}
