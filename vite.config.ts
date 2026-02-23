import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  plugins: [react({ babel: { plugins: ['babel-plugin-react-compiler'] } })],
  server: {
    host: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-three': ['react', 'react-dom', 'three', '@react-three/fiber', '@react-three/drei'],
        },
      },
    },
  },
})
