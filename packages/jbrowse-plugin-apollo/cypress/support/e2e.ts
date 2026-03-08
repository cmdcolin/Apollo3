// ***********************************************************
// This example support/e2e.js is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

// For Cypress v12.17.3 and older:
import compareSnapshotCommand from 'cypress-image-diff-js'
// Import commands.js using ES2015 syntax:
import './commands'

compareSnapshotCommand()

// Polyfill ES2023 array methods for Electron 106 (Cypress 12.17.3 uses
// Chrome 106 which predates these methods, but JBrowse v4 uses them)
Cypress.on('window:before:load', (win) => {
  const proto = win.Array.prototype
  if (!proto.toSorted) {
    proto.toSorted = function (compareFn?: (a: never, b: never) => number) {
      return [...this].sort(compareFn)
    }
  }
  if (!proto.toReversed) {
    proto.toReversed = function () {
      return [...this].reverse()
    }
  }
  if (!proto.findLast) {
    proto.findLast = function (
      fn: (v: never, i: number, a: never[]) => boolean,
    ) {
      for (let i = this.length - 1; i >= 0; i--) {
        if (fn(this[i], i, this)) {
          return this[i]
        }
      }
      return undefined
    }
  }
})

// Collect browser console errors and debug warnings for later flushing.
// Cannot call cy.task() directly inside window:before:load as it causes
// Cypress promise conflicts. Instead, collect into an array and flush
// in afterEach via cy.task().
Cypress.on('window:before:load', (win) => {
  ;(win as Window & { __apolloLogs?: string[] }).__apolloLogs = []
  const origError = win.console.error
  win.console.error = (...args: unknown[]) => {
    origError.apply(win.console, args)
    const msg = args.map(String).join(' ')
    if (msg.length < 500) {
      ;(win as Window & { __apolloLogs?: string[] }).__apolloLogs?.push(
        `ERROR: ${msg}`,
      )
    }
  }
  const origWarn = win.console.warn
  win.console.warn = (...args: unknown[]) => {
    origWarn.apply(win.console, args)
    const msg = args.map(String).join(' ')
    if (msg.includes('[apollo-debug]') && msg.length < 500) {
      ;(win as Window & { __apolloLogs?: string[] }).__apolloLogs?.push(
        `WARN: ${msg}`,
      )
    }
  }
})

// Flush collected browser logs to Node stdout after each test
afterEach(() => {
  cy.window({ log: false }).then((win) => {
    const logs = (win as Window & { __apolloLogs?: string[] }).__apolloLogs
    if (logs && logs.length > 0) {
      for (const msg of logs) {
        cy.task('log', `[browser] ${msg}`, { log: false })
      }
    }
  })
})

// Timing instrumentation for custom commands
const timingStack: { name: string; start: number }[] = []
function timedCommand(name: string, originalFn: () => void) {
  const start = performance.now()
  timingStack.push({ name, start })
  originalFn()
  cy.then(() => {
    const entry = timingStack.pop()
    if (entry) {
      const elapsed = ((performance.now() - entry.start) / 1000).toFixed(1)
      cy.task('log', `[timing] ${entry.name}: ${elapsed}s`, { log: false })
    }
  })
}

const originalOverwrite = Cypress.Commands.overwrite.bind(Cypress.Commands)
for (const cmd of [
  'loginAsGuest',
  'deleteAssemblies',
  'addAssemblyFromGff',
  'selectAssemblyToView',
  'addOntologies',
  'selectFromApolloMenu',
] as const) {
  originalOverwrite(
    cmd,
    (originalFn: (...args: unknown[]) => void, ...args: unknown[]) => {
      const start = performance.now()
      originalFn(...args)
      cy.then(() => {
        const elapsed = ((performance.now() - start) / 1000).toFixed(1)
        cy.task('log', `[timing] ${cmd}: ${elapsed}s`, { log: false })
      })
    },
  )
}

// Cypress.on('uncaught:exception', (err, _runnable) => {
//   if (err.message.includes('ResizeObserver')) {
//     return false
//   }
// })
