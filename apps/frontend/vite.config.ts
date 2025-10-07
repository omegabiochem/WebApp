// apps/web/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://localhost:3000',
      '/samples': 'http://localhost:3000',
      '/reports': 'http://localhost:3000',
      // add more API prefixes if you like
    },
  },
})
