import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          pixi: ['pixi.js', 'pixi-live2d-display'],
          database: ['dexie', 'dexie-react-hooks'],
        },
      },
    },
  },
  define: {
    // Define global constants
    __DEV__: JSON.stringify(process.env.NODE_ENV === 'development'),
    'import.meta.env': JSON.stringify(process.env),
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'dexie',
      'dexie-react-hooks',
      'pixi.js',
      'lucide-react',
    ],
  },
})
