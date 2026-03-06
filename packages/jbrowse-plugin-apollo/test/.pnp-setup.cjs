// Wrapper to load Yarn PnP in Electron's renderer process.
// Addresses two issues:
// 1. The .pnp.cjs starts with a shebang that Electron's require doesn't strip
// 2. PnP's zip reading uses setTimeout().unref() which isn't available in the
//    renderer (browser's setTimeout returns a number, not a Timeout object)

const fs = require('fs')
const path = require('path')
const Module = require('module')

// Skip MikroORM's package version check (it scans all installed @mikro-orm/*
// packages and can fail when PnP resolves multiple virtual instances)
process.env.MIKRO_ORM_ALLOW_VERSION_MISMATCH = '1'

// Polyfill Timer.unref() before PnP loads.
// In browsers, setTimeout returns a number. PnP expects a Node.js Timeout
// object with .unref(). We wrap the return in an object with .unref().
const origSetTimeout = global.setTimeout
global.setTimeout = function (...args) {
  const id = origSetTimeout.apply(this, args)
  // Wrap number IDs in an object with unref/ref
  if (typeof id === 'number') {
    return {
      _id: id,
      unref() {
        return this
      },
      ref() {
        return this
      },
      [Symbol.toPrimitive]() {
        return this._id
      },
    }
  }
  if (id && typeof id === 'object' && !id.unref) {
    id.unref = () => id
    id.ref = () => id
  }
  return id
}

const origSetInterval = global.setInterval
global.setInterval = function (...args) {
  const id = origSetInterval.apply(this, args)
  if (typeof id === 'number') {
    return {
      _id: id,
      unref() {
        return this
      },
      ref() {
        return this
      },
      [Symbol.toPrimitive]() {
        return this._id
      },
    }
  }
  if (id && typeof id === 'object' && !id.unref) {
    id.unref = () => id
    id.ref = () => id
  }
  return id
}

const pnpPath = path.resolve(__dirname, '../../../.pnp.cjs')
let pnpCode = fs.readFileSync(pnpPath, 'utf8')

// Strip shebang line
if (pnpCode.startsWith('#!')) {
  pnpCode = pnpCode.slice(pnpCode.indexOf('\n') + 1)
}

// Create a module for the PnP code
const pnpModule = new Module(pnpPath)
pnpModule.filename = pnpPath
pnpModule.paths = Module._nodeModulePaths(path.dirname(pnpPath))
pnpModule._compile(pnpCode, pnpPath)

// Call setup to patch Module._resolveFilename
if (pnpModule.exports && typeof pnpModule.exports.setup === 'function') {
  pnpModule.exports.setup()
}
