import path from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const VITE_PORT = 5173
const BACKEND = 'http://localhost:3999'

const detailRoutes: Record<string, string> = {
  '/ui/assemblies/': '/ui/assembly-detail/index.html',
  '/ui/organisms/': '/ui/organism-detail/index.html',
  '/ui/assembly-checks/': '/ui/assembly-checks/index.html',
  '/ui/assembly-tracks/': '/ui/assembly-tracks/index.html',
  '/ui/edit-assembly/': '/ui/edit-assembly/index.html',
  '/ui/edit-organism/': '/ui/edit-organism/index.html',
}

export default defineConfig({
  clearScreen: false,
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
    port: VITE_PORT,
    proxy: {
      '/analysis': BACKEND,
      '/assemblies': BACKEND,
      '/auth': BACKEND,
      '/changes': BACKEND,
      '/checks': BACKEND,
      '/export': BACKEND,
      '/features': BACKEND,
      '/files': BACKEND,
      // Set x-forwarded-host so the NestJS JBrowse config endpoint generates a
      // baseURL pointing at the Vite dev server rather than the backend. This
      // keeps all API calls same-origin, so auth cookies are sent correctly.
      '/jbrowse': {
        target: BACKEND,
        headers: { 'x-forwarded-host': `localhost:${VITE_PORT}` },
      },
      '/organisms': BACKEND,
      '/permissions': BACKEND,
      '/refSeqs': BACKEND,
      '/sequence': BACKEND,
      '/socket.io': { target: BACKEND, ws: true },
      '/tracks': BACKEND,
      '/users': BACKEND,
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
        'ui/sequence-search/local-blast/index': path.resolve(
          __dirname,
          'ui/sequence-search/local-blast/index.html',
        ),
        'ui/sequence-search/blat/index': path.resolve(
          __dirname,
          'ui/sequence-search/blat/index.html',
        ),
        'ui/sequence-search/miniprot/index': path.resolve(
          __dirname,
          'ui/sequence-search/miniprot/index.html',
        ),
        'ui/sequence-search/ispcr/index': path.resolve(
          __dirname,
          'ui/sequence-search/ispcr/index.html',
        ),
        'admin/users/index': path.resolve(__dirname, 'admin/users/index.html'),
        'admin/approve-users/index': path.resolve(
          __dirname,
          'admin/approve-users/index.html',
        ),
        'admin/jobs/index': path.resolve(__dirname, 'admin/jobs/index.html'),
        'admin/analysis-databases/index': path.resolve(
          __dirname,
          'admin/analysis-databases/index.html',
        ),
        'admin/add-assembly/index': path.resolve(
          __dirname,
          'admin/add-assembly/index.html',
        ),
        'ui/invite/index': path.resolve(
          __dirname,
          'ui/invite/index.html',
        ),
        'ui/assembly-checks/index': path.resolve(
          __dirname,
          'ui/assembly-checks/index.html',
        ),
        'ui/assembly-tracks/index': path.resolve(
          __dirname,
          'ui/assembly-tracks/index.html',
        ),
        'ui/edit-assembly/index': path.resolve(
          __dirname,
          'ui/edit-assembly/index.html',
        ),
        'ui/edit-organism/index': path.resolve(
          __dirname,
          'ui/edit-organism/index.html',
        ),
        'ui/signin/index': path.resolve(__dirname, 'ui/signin/index.html'),
        'error/index': path.resolve(__dirname, 'error/index.html'),
      },
    },
  },
})
