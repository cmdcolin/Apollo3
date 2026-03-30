import path from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const detailRoutes: Record<string, string> = {
  '/ui/assemblies/': '/ui/assembly-detail/index.html',
  '/ui/organisms/': '/ui/organism-detail/index.html',
  '/ui/assembly-checks/': '/ui/assembly-checks/index.html',
  '/ui/assembly-admin/': '/ui/assembly-admin/index.html',
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
      '/analysis': 'http://localhost:3999',
      '/assemblies': 'http://localhost:3999',
      '/auth': 'http://localhost:3999',
      '/changes': 'http://localhost:3999',
      '/checks': 'http://localhost:3999',
      '/export': 'http://localhost:3999',
      '/features': 'http://localhost:3999',
      '/files': 'http://localhost:3999',
      '/jbrowse': 'http://localhost:3999',
      '/organisms': 'http://localhost:3999',
      '/permissions': 'http://localhost:3999',
      '/refSeqs': 'http://localhost:3999',
      '/sequence': 'http://localhost:3999',
      '/socket.io': { target: 'http://localhost:3999', ws: true },
      '/tracks': 'http://localhost:3999',
      '/users': 'http://localhost:3999',
    },
  },
  build: {
    outDir: '../dist/pages',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, 'index.html'),
        'ui/organisms/index': path.resolve(
          __dirname,
          'ui/organisms/index.html',
        ),
        'ui/assemblies/index': path.resolve(
          __dirname,
          'ui/assemblies/index.html',
        ),
        'ui/organism-detail/index': path.resolve(
          __dirname,
          'ui/organism-detail/index.html',
        ),
        'ui/assembly-detail/index': path.resolve(
          __dirname,
          'ui/assembly-detail/index.html',
        ),
        'ui/changes/index': path.resolve(__dirname, 'ui/changes/index.html'),
        'ui/sequence-search/index': path.resolve(
          __dirname,
          'ui/sequence-search/index.html',
        ),
        'admin/users/index': path.resolve(__dirname, 'admin/users/index.html'),
        'admin/approve-users/index': path.resolve(
          __dirname,
          'admin/approve-users/index.html',
        ),
        'admin/jobs/index': path.resolve(__dirname, 'admin/jobs/index.html'),
        'admin/add-assembly/index': path.resolve(
          __dirname,
          'admin/add-assembly/index.html',
        ),
        'admin/login/index': path.resolve(
          __dirname,
          'admin/login/index.html',
        ),
        'ui/invite/index': path.resolve(
          __dirname,
          'ui/invite/index.html',
        ),
        'ui/assembly-checks/index': path.resolve(
          __dirname,
          'ui/assembly-checks/index.html',
        ),
        'ui/assembly-admin/index': path.resolve(
          __dirname,
          'ui/assembly-admin/index.html',
        ),
        'error/index': path.resolve(__dirname, 'error/index.html'),
      },
    },
  },
})
