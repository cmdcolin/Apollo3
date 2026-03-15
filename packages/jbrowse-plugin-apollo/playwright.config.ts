import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './pw-tests',
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3999',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
})
