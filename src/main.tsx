import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from '@/auth'
import { ThemeSync } from '@/theme-sync'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ThemeSync />
      <App />
    </AuthProvider>
  </StrictMode>,
)
