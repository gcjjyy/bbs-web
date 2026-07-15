import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // The server serves static files from frontend/build
    outDir: 'build'
  },
  server: {
    // Proxy API and Socket.IO traffic to the local BBS proxy server
    proxy: {
      '/socket.io': {
        target: 'http://localhost:8199',
        ws: true
      },
      '/api': {
        target: 'http://localhost:8199'
      }
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.ts'
  }
})
