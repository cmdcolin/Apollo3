// Access Electron's native Node.js require function.
// In UMD bundles, rollup transforms bare `require()` calls into its own
// `commonjsRequire()` stub which throws at runtime. By accessing `require`
// through bracket notation on `globalThis`, we bypass rollup's static
// analysis and get the real Node.js require provided by Electron.

type GlobalWithRequire = typeof globalThis & { require?: NodeRequire }

export function getElectronRequire() {
  const req = (globalThis as GlobalWithRequire)[
    'require' as keyof typeof globalThis
  ]
  if (!req) {
    throw new Error(
      'Node.js require is not available. This code must run in an Electron environment.',
    )
  }
  return req as NodeRequire
}
