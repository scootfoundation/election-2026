import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' lets the build work under any GitHub Pages sub-path.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    // Dev only: the Commission's feed sends no CORS headers, so proxy it.
    proxy: {
      '/xml': { target: 'https://media.election.net.nz', changeOrigin: true },
    },
  },
})
