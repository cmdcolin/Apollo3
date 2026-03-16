import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { defineConfig } from 'vite'

const detailRoutes: Record<string, string> = {
  '/ui/assemblies/': '/ui/assembly-detail/index.html',
  '/ui/organisms/': '/ui/organism-detail/index.html',
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'detail-page-rewrite',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url) {
            for (const [prefix, target] of Object.entries(detailRoutes)) {
              const rest = req.url.startsWith(prefix)
                ? req.url.slice(prefix.length)
                : undefined
              if (rest && rest.length > 0 && !rest.startsWith('index.html')) {
                req.url = target
                break
              }
            }
          }
          next()
        })
      },
    },
  ],
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
      '/tracks': 'http://localhost:3999',
      '/tools': 'http://localhost:3999',
      '/analysis': 'http://localhost:3999',
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
        'ui/organism-detail/index': resolve(
          __dirname,
          'ui/organism-detail/index.html',
        ),
        'ui/assembly-detail/index': resolve(
          __dirname,
          'ui/assembly-detail/index.html',
        ),
        'ui/changes/index': resolve(__dirname, 'ui/changes/index.html'),
        'ui/sequence-search/index': resolve(
          __dirname,
          'ui/sequence-search/index.html',
        ),
        'admin/users/index': resolve(__dirname, 'admin/users/index.html'),
        'admin/jobs/index': resolve(__dirname, 'admin/jobs/index.html'),
        'error/index': resolve(__dirname, 'error/index.html'),
      },
    },
  },
})
