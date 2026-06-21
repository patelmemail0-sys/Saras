import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Dedicated ports so Saras never collides with other local projects.
  server: { port: 5180 },
  preview: { port: 4180 },
  // react-three-fiber renders through its own reconciler; without deduping,
  // Vite's pre-bundling can hand the dep a second React instance and every r3f
  // hook throws "Invalid hook call".
  resolve: {
    dedupe: ['react', 'react-dom', 'three', '@react-three/fiber'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'three', '@react-three/fiber', '@react-three/drei'],
  },
})
