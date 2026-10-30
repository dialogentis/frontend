import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { env } from 'node:process'

export default defineConfig({
  plugins: [react()],
  server: { port: 5178, strictPort: true, proxy: { '/api': { target: env.API_PROXY_TARGET || 'http://127.0.0.1:18000' } } },
})
