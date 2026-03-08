/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

const fs = require('node:fs')

const { defineConfig } = require('cypress')
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const getCompareSnapshotsPlugin = require('cypress-image-diff-js/plugin')

module.exports = defineConfig({
  // Make viewport long and thin to avoid the scrollbar on the right interfere
  // with the coordinates
  viewportHeight: 2000,
  viewportWidth: 1300,
  retries: {
    runMode: 2,
  },
  screenshotOnRunFailure: false,
  video: false,
  e2e: {
    baseUrl: 'http://localhost:8999',
    setupNodeEvents(on, config) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      getCompareSnapshotsPlugin(on, config)
      on('task', {
        readdirSync(path) {
          return fs.readdirSync(path)
        },
      })
      return config
    },
  },
})
