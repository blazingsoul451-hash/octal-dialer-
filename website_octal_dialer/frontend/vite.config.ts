import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/auth': { target: 'http://127.0.0.1:5000', changeOrigin: true, secure: false },
      '/api': { target: 'http://127.0.0.1:5000', changeOrigin: true, secure: false },
      '/email': { target: 'http://127.0.0.1:5000', changeOrigin: true, secure: false },
      '/admin': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false,
        bypass: (req) => {
          if (req.headers.accept && req.headers.accept.includes('text/html')) {
            return '/index.html';
          }
        }
      },
      '/campaigns': { target: 'http://127.0.0.1:5000', changeOrigin: true, secure: false },
      '/leads': { target: 'http://127.0.0.1:5000', changeOrigin: true, secure: false },
      '/logs': { target: 'http://127.0.0.1:5000', changeOrigin: true, secure: false },
      '/settings': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false,
        bypass: (req) => {
          if (req.headers.accept && req.headers.accept.includes('text/html')) {
            return '/index.html';
          }
        }
      },
      '/info': { target: 'http://127.0.0.1:5000', changeOrigin: true, secure: false },
      '/health': { target: 'http://127.0.0.1:5000', changeOrigin: true, secure: false },
      '/ready': { target: 'http://127.0.0.1:5000', changeOrigin: true, secure: false },
      '/download': { target: 'http://127.0.0.1:5000', changeOrigin: true, secure: false },
      '/crm': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false,
        bypass: (req) => {
          if (req.headers.accept && req.headers.accept.includes('text/html')) {
            return '/index.html';
          }
        }
      },
      '/socket.io': { target: 'http://127.0.0.1:5000', ws: true, changeOrigin: true }
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
