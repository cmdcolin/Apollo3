import 'cypress-fail-fast'
import '@cypress/grep'
import compareSnapshotCommand from 'cypress-image-diff-js'
import installLogsCollector from 'cypress-terminal-report/src/installLogsCollector'
import './commands'

installLogsCollector()

compareSnapshotCommand()

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
  const origLog = win.console.log
  win.console.log = (...args: unknown[]) => {
    origLog.apply(win.console, args)
    const msg = args.map(String).join(' ')
    if (msg.includes('[DEBUG') && msg.length < 500) {
      ;(win as Window & { __apolloLogs?: string[] }).__apolloLogs?.push(
        `LOG: ${msg}`,
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
