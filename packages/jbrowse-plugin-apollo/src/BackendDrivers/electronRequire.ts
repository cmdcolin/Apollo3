// Access Electron's native Node.js require function.
// In UMD bundles, rollup transforms bare `require()` calls into its own
// `commonjsRequire()` stub which throws at runtime. By accessing `require`
// through bracket notation on `globalThis`, we bypass rollup's static
// analysis and get the real Node.js require provided by Electron.

type GlobalWithRequire = Omit<typeof globalThis, 'require'> & {
  require?: NodeJS.Require
}

export function getElectronRequire() {
  const g = globalThis as GlobalWithRequire
  if (!g.require) {
    throw new Error(
      'Node.js require is not available. This code must run in an Electron environment.',
    )
  }
  return g.require
}
