import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  addAssemblyFromGff,
  annotationTrackAppearance,
  loginAsRoot,
  resetDatabase,
  selectAssemblyToView,
} from './helpers.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const GFF_PATH = path.resolve(__dirname, '../test_data/mergeTranscripts.gff3')
const ASSEMBLY = 'mergeTranscripts.gff3'

test.beforeEach(async ({ page }) => {
  await resetDatabase()
  await loginAsRoot(page)
})

test.afterEach(async ({ page }) => {
  await page.goto('about:blank')
})

test('Merge multiple exons', async ({ page }) => {
  await addAssemblyFromGff(page, ASSEMBLY, GFF_PATH)
  await selectAssemblyToView(page, ASSEMBLY, 'chr2:1..60')
  await annotationTrackAppearance(page, 'Show both graphical and table display')

  // Verify mrna03 is visible before merge
  await expect(page.getByText('ID=mrna03,')).toBeVisible({ timeout: 10_000 })

  // Right-click mrna02 and merge with mrna03
  await page.getByText('ID=mrna02').click({ button: 'right', force: true })
  await page
    .getByText('Merge transcripts', { exact: false })
    .click({ timeout: 10_000 })
  await expect(page.getByText('Merge with transcript:')).toBeVisible({
    timeout: 10_000,
  })
  await page.getByLabel('y [5-30]').click()
  await page.getByRole('button', { name: 'Submit' }).click()

  // mrna03 should be gone after merge
  await expect(page.getByText('ID=mrna03,')).not.toBeVisible({ timeout: 10_000 })

  // mrna02 should now have merged bounds (3-30) and merged_with attribute
  const mrna02Row = page.getByText('ID=mrna02').locator('..')
  await expect(mrna02Row.locator('input[value="30"]')).toBeVisible({
    timeout: 10_000,
  })
  await expect(mrna02Row.getByText(/merged_with/)).toBeVisible()

  // Merge mrna05 into mrna02
  await page.getByText('ID=mrna02').click({ button: 'right', force: true })
  await page
    .getByText('Merge transcripts', { exact: false })
    .click({ timeout: 10_000 })
  await expect(page.getByText('Merge with transcript:')).toBeVisible({
    timeout: 10_000,
  })
  await page.getByLabel('mrna05 [26-40]').click()
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByText('ID=mrna05,')).not.toBeVisible({ timeout: 10_000 })

  // Reload page to verify persistence
  await page.reload()
  await expect(page.getByRole('button', { name: 'Apollo' })).toBeEnabled({
    timeout: 20_000,
  })

  // JBrowse remembers the session including track display mode,
  // so just wait for the table to load after reload
  await expect(page.locator('tbody')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('ID=mrna02')).toBeVisible({ timeout: 15_000 })

  // mrna03 and mrna05 should still be gone after reload
  await expect(page.getByText('ID=mrna03,')).not.toBeVisible()
  await expect(page.getByText('ID=mrna05,')).not.toBeVisible()
})
