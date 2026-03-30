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
const GFF_PATH = path.resolve(
  __dirname,
  '../test_data/cdsChecks/stopcodon.gff3',
)

test.beforeEach(async ({ page }) => {
  await resetDatabase()
  await loginAsRoot(page)
})

test.afterEach(async ({ page }) => {
  await page.goto('about:blank')
})

test('Show warnings after editing and after fixing', async ({ page }) => {
  await addAssemblyFromGff(page, 'stopcodon.gff3', GFF_PATH)
  await selectAssemblyToView(page, 'stopcodon.gff3', 'gene07')
  await annotationTrackAppearance(page, 'Show both graphical and table display')

  // Right-click cds07 to open context menu and edit feature details
  await expect(page.getByText('cds07')).toBeVisible({ timeout: 10_000 })
  await page.getByText('cds07').click({ button: 'right' })
  await page.getByText('Edit feature details').click()

  // Wait for the feature details widget to load
  const basicInfo = page.locator('div[data-testid="basic_information"]')
  await expect(basicInfo).toBeVisible({ timeout: 10_000 })

  // Change start from 16 to 4
  const startInput = basicInfo.getByLabel('Start')
  await expect(startInput).toBeVisible()
  await startInput.fill('4')
  await startInput.press('Tab')
  await expect(startInput).not.toBeDisabled({ timeout: 5_000 })

  // Change end from 27 to 24
  const endInput = basicInfo.getByLabel('End')
  await expect(endInput).toBeVisible()
  await endInput.fill('24')
  await endInput.press('Tab')
  await expect(endInput).not.toBeDisabled({ timeout: 5_000 })

  // Zoom out to see error icons
  await page.locator('button[data-testid="zoom_out"]').click()

  // Should show 3 error icons
  await expect(page.locator('[data-testid^="ErrorIcon-"]')).toHaveCount(3, {
    timeout: 15_000,
  })

  // Hover to see tooltip
  await page.locator('[data-testid="ErrorIcon-24"]').hover()
  await expect(page.getByText(/Missing stop codon/)).toBeVisible()

  // Fix: change end back to 27
  const fixInput = basicInfo.getByLabel('End')
  await fixInput.fill('27')
  await fixInput.press('Tab')
  await expect(fixInput).not.toBeDisabled({ timeout: 5_000 })

  await page.locator('button[data-testid="zoom_out"]').click()
  await page.reload()

  // Should now show only 2 error icons (internal stop codon remains)
  await expect(page.locator('[data-testid^="ErrorIcon-"]')).toHaveCount(2, {
    timeout: 10_000,
  })
})

// TODO: re-enable once "Manage Checks" UI is re-implemented in the admin panel.
// The ManageChecks component was removed during the API simplification;
// checks are now managed via PATCH /assemblies/:id { checks: [...] }.
test.skip('Register and unregister checks', async () => {})

test('Warnings rendered for overlapping genes', async ({ page }) => {
  await addAssemblyFromGff(page, 'stopcodon.gff3', GFF_PATH)
  await selectAssemblyToView(page, 'stopcodon.gff3', 'gene09')

  await page.locator('button[data-testid="zoom_out"]').click()
  await expect(page.locator('[data-testid^="ErrorIcon-"]')).toHaveCount(3, {
    timeout: 15_000,
  })

  // Verify specific error icons exist at expected genomic positions:
  // - ErrorIcon-6: missing stop codon for mrna09.1 (minus strand)
  // - ErrorIcon-29: missing stop codon for mrna10.2 (plus strand)
  // - ErrorIcon-30: missing stop codon for mrna10.1 (plus strand)
  await expect(page.locator('[data-testid="ErrorIcon-6"]')).toBeVisible()
  await expect(page.locator('[data-testid="ErrorIcon-29"]')).toBeVisible()
  await expect(page.locator('[data-testid="ErrorIcon-30"]')).toBeVisible()

  // Icons at positions 29 and 30 should be close together horizontally
  const iconPos29 = await page
    .locator('[data-testid="ErrorIcon-29"]')
    .locator('..')
    .boundingBox()
  const iconPos30 = await page
    .locator('[data-testid="ErrorIcon-30"]')
    .locator('..')
    .boundingBox()
  expect(iconPos29).toBeTruthy()
  expect(iconPos30).toBeTruthy()
  expect(Math.abs(iconPos29!.x - iconPos30!.x)).toBeLessThan(50)
})
