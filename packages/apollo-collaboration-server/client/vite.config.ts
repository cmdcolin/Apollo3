import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/organisms': 'http://localhost:3999',
      '/assemblies': 'http://localhost:3999',
      '/changes': 'http://localhost:3999',
      '/users': 'http://localhost:3999',
      '/auth': 'http://localhost:3999',
      '/refSeqs': 'http://localhost:3999',
      '/features': 'http://localhost:3999',
    },
  },
  build: {
    outDir: '../dist/pages',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        'ui/organisms/index': resolve(__dirname, 'ui/organisms/index.html'),
        'ui/assemblies/index': resolve(__dirname, 'ui/assemblies/index.html'),
        'ui/changes/index': resolve(__dirname, 'ui/changes/index.html'),
        'admin/users/index': resolve(__dirname, 'admin/users/index.html'),
      },
    },
  },
})
