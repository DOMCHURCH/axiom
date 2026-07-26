import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev, proxy /api -> the FastAPI backend (default :8000). Override with
// VITE_API_PROXY. In production the frontend calls VITE_API_URL directly.
const API_PROXY = process.env.VITE_API_PROXY || 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: API_PROXY, changeOrigin: true },
    },
  },
})
