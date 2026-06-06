import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ClerkProvider } from '@clerk/clerk-react'
import Landing from './pages/Landing.jsx'
import App from './App.jsx'
import Account from './pages/Account.jsx'
import ReportPage from './pages/ReportPage.jsx'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!PUBLISHABLE_KEY) {
  console.warn('VITE_CLERK_PUBLISHABLE_KEY not set — auth UI will be hidden')
}

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/app" element={<App />} />
        <Route path="/account" element={<Account />} />
        <Route path="/report/:id" element={<ReportPage />} />
        <Route path="*" element={<Landing />} />
      </Routes>
    </BrowserRouter>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {PUBLISHABLE_KEY ? (
      <ClerkProvider publishableKey={PUBLISHABLE_KEY} signInUrl="/" signUpUrl="/" fallbackRedirectUrl="/app">
        <AppRoutes />
      </ClerkProvider>
    ) : (
      <AppRoutes />
    )}
  </StrictMode>
)
