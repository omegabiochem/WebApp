// apps/web/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // '/auth': 'http://localhost:3000',
      // '/samples': 'http://localhost:3000',
      // '/reports': 'http://localhost:3000',
      // add more API prefixes if you like
    },
  },
   resolve: {
    dedupe: ['react', 'react-dom'],
    // optional hard pins if you ever link/hoist packages:
    alias: {
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
    },
  },
})
