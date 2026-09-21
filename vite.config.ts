import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { healthApiDevPlugin } from './server/dev-api-plugin.ts'

export default defineConfig({
  plugins: [react(), tailwindcss(), healthApiDevPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
