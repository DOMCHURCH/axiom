import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import BestStocks from './pages/BestStocks.jsx'
import StockDetail from './pages/StockDetail.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<BestStocks />} />
        <Route path="/stock/:ticker" element={<StockDetail />} />
        <Route path="*" element={<BestStocks />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
