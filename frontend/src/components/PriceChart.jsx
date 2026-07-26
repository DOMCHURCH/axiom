// AXIOM price chart — TradingView lightweight-charts (candles + volume).
// Ported from daddiesmoney and re-themed to the AXIOM navy/cyan palette.
import { CandlestickSeries, ColorType, HistogramSeries, createChart } from 'lightweight-charts'
import { useEffect, useRef } from 'react'
import { report as C } from '../lib/tokens.js'

export default function PriceChart({ candles, height = 380 }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!ref.current || !candles || candles.length === 0) return

    const chart = createChart(ref.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'rgba(148,163,184,0.65)',
        fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.08)', timeVisible: false },
      crosshair: {
        mode: 1,
        vertLine: { color: 'rgba(245,165,36,0.45)', labelBackgroundColor: '#1a1206' },
        horzLine: { color: 'rgba(245,165,36,0.45)', labelBackgroundColor: '#1a1206' },
      },
      autoSize: true,
    })

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: C.positive, downColor: C.negative,
      borderUpColor: C.positive, borderDownColor: C.negative,
      wickUpColor: C.positive, wickDownColor: C.negative,
    })
    candleSeries.setData(
      candles.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })),
    )

    const volSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: 'vol',
      priceFormat: { type: 'volume' },
    })
    volSeries.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
    volSeries.setData(
      candles.map((c) => ({
        time: c.time,
        value: c.volume ?? 0,
        color: c.close >= c.open ? 'rgba(34,197,94,0.28)' : 'rgba(248,113,113,0.28)',
      })),
    )

    chart.timeScale().fitContent()
    return () => chart.remove()
  }, [candles])

  return <div ref={ref} style={{ height, width: '100%' }} />
}
