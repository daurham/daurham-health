import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from '@/auth'
import { ThemeSync } from '@/theme-sync'
import { installStaleChunkRecovery } from '@/lib/stale-chunk-recovery'
import App from './App.tsx'
import './index.css'

installStaleChunkRecovery()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ThemeSync />
      <App />
    </AuthProvider>
  </StrictMode>,
)
