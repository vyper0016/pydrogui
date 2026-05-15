import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/read-register': 'http://localhost:8000',
      '/disassemble-last-instruction': 'http://localhost:8000',
      '/step': 'http://localhost:8000',
      '/reset': 'http://localhost:8000',
    },
  },
})
