import { build } from 'esbuild'
import { glob } from 'glob'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../../..')

const packages = [
  'apollo-common',
  'apollo-entities',
  'apollo-mst',
  'apollo-shared',
  'apollo-collaboration-server',
]

await Promise.all(
  packages.map(async (pkg) => {
    const pkgDir = path.join(root, 'packages', pkg)
    const files = await glob('src/**/*.ts', {
      cwd: pkgDir,
      ignore: ['**/*.test.ts', '**/*.spec.ts'],
    })
    if (files.length > 0) {
      await build({
        entryPoints: files,
        outdir: path.join(pkgDir, 'dist'),
        outbase: path.join(pkgDir, 'src'),
        format: 'esm',
        platform: 'node',
        target: 'es2023',
        sourcemap: true,
        packages: 'external',
        logLevel: 'warning',
        absWorkingDir: pkgDir,
      })
    }
  }),
)
