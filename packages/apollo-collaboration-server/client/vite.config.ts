import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        organisms: resolve(__dirname, 'organisms/index.html'),
        assemblies: resolve(__dirname, 'assemblies/index.html'),
        changes: resolve(__dirname, 'changes/index.html'),
      },
    },
  },
  base: '/admin/',
})
