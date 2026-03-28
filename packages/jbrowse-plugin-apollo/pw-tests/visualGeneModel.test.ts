import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  addAssemblyFromGff,
  deleteAssemblies,
  loginAsRoot,
  selectAssemblyToView,
} from './helpers.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const GFF_PATH = path.resolve(__dirname, '../test_data/so_types.gff3')

test.beforeEach(async ({ page }) => {
  await loginAsRoot(page)
})

test.afterEach(async ({ page }) => {
  await page.goto('about:blank')
  await deleteAssemblies()
})

test('Shows correct gene model', async ({ page }) => {
  await addAssemblyFromGff(page, 'so_types.gff3', GFF_PATH)
  await selectAssemblyToView(page, 'so_types.gff3', 'TGGT1_200010')

  // Close drawer if open
  const closeDrawer = page.locator('button[aria-label="Close drawer"]')
  if (await closeDrawer.isVisible().catch(() => false)) {
    await closeDrawer.click()
  }

  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})

  const canvas = page.locator('canvas[data-testid="overlayCanvas"]')
  await expect(canvas).toHaveScreenshot('gene-model.png', {
    maxDiffPixelRatio: 0.05,
  })
})
