import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 3000, strictPort: true, allowedHosts: true },
  build: {
    rollupOptions: {
      output: {
        // Nomi file fissi (senza hash): un index.html in cache punta sempre a file esistenti → niente schermata bianca
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/app-[name].js',
        assetFileNames: 'assets/app.[ext]',
      },
    },
  },
})
