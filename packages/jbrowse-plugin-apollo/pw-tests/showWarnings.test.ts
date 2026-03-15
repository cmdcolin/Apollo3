import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  addAssemblyFromGff,
  annotationTrackAppearance,
  deleteAssemblies,
  loginAsGuest,
  selectAssemblyToView,
  selectFromApolloMenu,
} from './helpers.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const GFF_PATH = path.resolve(
  __dirname,
  '../test_data/cdsChecks/stopcodon.gff3',
)

test.beforeEach(async ({ page }) => {
  await loginAsGuest(page)
})

test.afterEach(async ({ page }) => {
  await page.goto('about:blank')
  await deleteAssemblies()
})

test('Show warnings after editing and after fixing', async ({ page }) => {
  await addAssemblyFromGff(page, 'stopcodon.gff3', GFF_PATH)
  await selectAssemblyToView(page, 'stopcodon.gff3', 'gene07')
  await annotationTrackAppearance(page, 'Show both graphical and table display')

  // Edit feature details to trigger warnings
  await page.getByText('cds07').click({ button: 'right' })
  await page.getByText('Edit feature details').click()

  const basicInfo = page
    .locator('div[data-testid="basic_information"]')
    .locator('..')

  // Change start from 16 to 4
  const startInput = basicInfo.locator('input[value="16"]')
  await startInput.fill('4')
  await startInput.press('Enter')
  await expect(basicInfo.locator('input[value="4"]')).not.toBeDisabled()

  // Change end from 27 to 24
  const endInput = basicInfo.locator('input[value="27"]')
  await endInput.fill('24')
  await endInput.press('Enter')
  await expect(basicInfo.locator('input[value="24"]')).not.toBeDisabled()

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
  const fixInput = basicInfo.locator('input[value="24"]')
  await fixInput.fill('27')
  await fixInput.press('Enter')
  await expect(basicInfo.locator('input[value="27"]')).not.toBeDisabled()

  await page.locator('button[data-testid="zoom_out"]').click()
  await page.reload()

  // Should now show only 2 error icons (internal stop codon remains)
  await expect(page.locator('[data-testid^="ErrorIcon-"]')).toHaveCount(2, {
    timeout: 10_000,
  })
})

test('Register and unregister checks', async ({ page }) => {
  await addAssemblyFromGff(page, 'stopcodon.gff3', GFF_PATH)
  await selectAssemblyToView(page, 'stopcodon.gff3', 'gene02')

  await page.locator('button[data-testid="zoom_out"]').click()
  const errorIcons = page.locator('[data-testid^="ErrorIcon-"]')
  await expect(errorIcons).not.toHaveCount(0, { timeout: 5_000 })

  // Unregister all checks
  await selectFromApolloMenu(page, ['Admin', 'Manage Checks'])
  const manageChecksDialog = page.getByText('Manage Checks').locator('..')
  const checkboxes = manageChecksDialog.locator(
    'tbody > tr input[type="checkbox"]',
  )
  const count = await checkboxes.count()
  for (let i = 0; i < count; i++) {
    const checkbox = checkboxes.nth(i)
    if (await checkbox.isChecked()) {
      await checkbox.click()
    }
  }
  await manageChecksDialog.getByRole('button', { name: 'Submit' }).click()

  // No warnings should remain
  await expect(page.locator('[data-testid^="ErrorIcon-"]')).toHaveCount(0, {
    timeout: 5_000,
  })

  // Register CDSCheck only
  await selectFromApolloMenu(page, ['Admin', 'Manage Checks'])
  const dialog2 = page.getByText('Manage Checks').locator('..')
  await dialog2
    .locator('td')
    .filter({ hasText: 'CDSCheck' })
    .locator('..')
    .locator('input[type="checkbox"]')
    .click()

  const checksResponse = page.waitForResponse(
    (resp) =>
      resp.url().includes('/assemblies/checks') && resp.status() === 201,
  )
  await dialog2.getByRole('button', { name: 'Submit' }).click()
  await checksResponse

  await page.locator('button[data-testid="zoom_out"]').click()
  await expect(page.locator('[data-testid="ErrorIcon-6"]')).toHaveCount(1, {
    timeout: 10_000,
  })
})

test('Warnings are properly stacked', async ({ page }) => {
  await addAssemblyFromGff(page, 'stopcodon.gff3', GFF_PATH)
  await selectAssemblyToView(page, 'stopcodon.gff3', 'gene09')

  await page.locator('button[data-testid="zoom_out"]').click()
  await expect(page.locator('[data-testid^="ErrorIcon-"]')).toHaveCount(3, {
    timeout: 15_000,
  })

  const iconPos1 = await page
    .locator('[data-testid="ErrorIcon-6"]')
    .locator('..')
    .boundingBox()
  const iconPos2 = await page
    .locator('[data-testid="ErrorIcon-30"]')
    .locator('..')
    .boundingBox()
  const iconPos3 = await page
    .locator('[data-testid="ErrorIcon-29"]')
    .locator('..')
    .boundingBox()

  expect(iconPos1).toBeTruthy()
  expect(iconPos2).toBeTruthy()
  expect(iconPos3).toBeTruthy()

  // Icons in bottom rows have higher y coord
  expect(iconPos1!.y).toBeLessThan(iconPos3!.y)
  expect(iconPos1!.y).toBeLessThan(iconPos2!.y)
  expect(iconPos3!.y).toBeGreaterThan(iconPos2!.y)
})
