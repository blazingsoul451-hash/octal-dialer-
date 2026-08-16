import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/auth': { target: 'http://127.0.0.1:3000', changeOrigin: true, secure: false },
      '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true, secure: false },
      '/email': { target: 'http://127.0.0.1:3000', changeOrigin: true, secure: false },
      '/admin': { target: 'http://127.0.0.1:3000', changeOrigin: true, secure: false },
      '/campaigns': { target: 'http://127.0.0.1:3000', changeOrigin: true, secure: false },
      '/leads': { target: 'http://127.0.0.1:3000', changeOrigin: true, secure: false },
      '/logs': { target: 'http://127.0.0.1:3000', changeOrigin: true, secure: false },
      '/settings': { target: 'http://127.0.0.1:3000', changeOrigin: true, secure: false },
      '/info': { target: 'http://127.0.0.1:3000', changeOrigin: true, secure: false },
      '/health': { target: 'http://127.0.0.1:3000', changeOrigin: true, secure: false },
      '/ready': { target: 'http://127.0.0.1:3000', changeOrigin: true, secure: false },
      '/download': { target: 'http://127.0.0.1:3000', changeOrigin: true, secure: false },
      '/crm': { target: 'http://127.0.0.1:3000', changeOrigin: true, secure: false },
      '/socket.io': { target: 'http://127.0.0.1:3000', ws: true, changeOrigin: true }
    }
  },
  assetsInclude: ['**/*.webm', '**/*.mp4'],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-icons': ['lucide-react']
        }
      }
    }
  }
})
