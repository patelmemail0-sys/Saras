import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Dedicated ports so Saras never collides with other local projects.
  server: { port: 5180 },
  preview: { port: 4180 },
})
