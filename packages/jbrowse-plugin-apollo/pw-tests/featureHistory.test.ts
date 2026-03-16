import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  addAssemblyFromGff,
  annotationTrackAppearance,
  deleteAssemblies,
  loginAsGuest,
  refreshTableEditor,
  selectAssemblyToView,
} from './helpers.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const GFF_PATH = path.resolve(__dirname, '../test_data/onegene.fasta.gff3')
const ASSEMBLY = 'onegene.fasta.gff3'

test.beforeEach(async ({ page }) => {
  await loginAsGuest(page)
})

test.afterEach(async ({ page }) => {
  await page.goto('about:blank')
  await deleteAssemblies()
})

test('Feature history dialog opens and shows changes after an edit', async ({
  page,
}) => {
  await addAssemblyFromGff(page, ASSEMBLY, GFF_PATH)
  await selectAssemblyToView(page, ASSEMBLY, 'gx1')
  await annotationTrackAppearance(page, 'Show both graphical and table display')

  const tbody = page.locator('tbody')
  await expect(tbody).toBeVisible({ timeout: 10_000 })

  // Make an edit so the history has at least one entry
  const cds1Row = tbody.locator('tr').filter({ hasText: 'CDS1' })
  const endCell = cds1Row.locator('td').filter({ hasText: '99' })
  const endInput = endCell.locator('input')
  await endInput.fill('95')
  await endInput.press('Enter')
  await page.waitForResponse(
    (resp) => resp.url().includes('/changes') && resp.status() === 201,
  )

  await refreshTableEditor(page)
  await expect(tbody).toBeVisible({ timeout: 10_000 })

  // Right-click on the gene feature and open "View feature history"
  await tbody
    .locator('tr')
    .filter({ hasText: '=gx1' })
    .click({ button: 'right' })
  await page.getByText('View feature history').click({ timeout: 10_000 })

  // Dialog should open
  const dialog = page.locator('[data-testid="feature-changelog"]')
  await expect(dialog).toBeVisible({ timeout: 5_000 })
  await expect(dialog.getByText('Feature history')).toBeVisible()

  // DataGrid should be present
  await expect(page.locator('[role="grid"]')).toBeVisible({ timeout: 10_000 })

  // Close the dialog
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(dialog).not.toBeVisible()
})

test('Feature history shows changes for child features of the same gene', async ({
  page,
}) => {
  await addAssemblyFromGff(page, ASSEMBLY, GFF_PATH)
  await selectAssemblyToView(page, ASSEMBLY, 'gx1')
  await annotationTrackAppearance(page, 'Show both graphical and table display')

  const tbody = page.locator('tbody')
  await expect(tbody).toBeVisible({ timeout: 10_000 })

  // Edit CDS1 to create a change entry
  const cds1Row = tbody.locator('tr').filter({ hasText: 'CDS1' })
  const endCell = cds1Row.locator('td').filter({ hasText: '99' })
  await endCell.locator('input').fill('80')
  await endCell.locator('input').press('Enter')
  await page.waitForResponse(
    (resp) => resp.url().includes('/changes') && resp.status() === 201,
  )

  await refreshTableEditor(page)
  await expect(tbody).toBeVisible({ timeout: 10_000 })

  // Open history from the gene row — it should also include changes to child features
  await tbody
    .locator('tr')
    .filter({ hasText: '=gx1' })
    .click({ button: 'right' })
  await page.getByText('View feature history').click({ timeout: 10_000 })

  const dialog = page.locator('[data-testid="feature-changelog"]')
  await expect(dialog).toBeVisible({ timeout: 5_000 })

  // The grid should have at least one row (the CDS edit)
  const grid = page.locator('[role="grid"]')
  await expect(grid).toBeVisible({ timeout: 10_000 })
  const dataRows = grid
    .locator('[role="row"]')
    .filter({ hasNot: page.locator('[role="columnheader"]') })
  await expect(dataRows).not.toHaveCount(0, { timeout: 10_000 })

  await dialog.getByRole('button', { name: 'Close' }).click()
})

test('Feature history API returns changes for a specific feature', async ({
  page,
}) => {
  await addAssemblyFromGff(page, ASSEMBLY, GFF_PATH)
  await selectAssemblyToView(page, ASSEMBLY, 'gx1')
  await annotationTrackAppearance(page, 'Show both graphical and table display')

  const tbody = page.locator('tbody')
  await expect(tbody).toBeVisible({ timeout: 10_000 })

  // Make two edits to create two change records
  const cds1Row = tbody.locator('tr').filter({ hasText: 'CDS1' })
  await cds1Row
    .locator('td')
    .filter({ hasText: '99' })
    .locator('input')
    .fill('90')
  await cds1Row
    .locator('td')
    .filter({ hasText: '99' })
    .locator('input')
    .press('Enter')
  const firstChange = page.waitForResponse(
    (resp) => resp.url().includes('/changes') && resp.status() === 201,
  )
  await firstChange

  await refreshTableEditor(page)
  await expect(tbody).toBeVisible({ timeout: 10_000 })

  // Open history for the tx1 transcript
  await tbody
    .locator('tr')
    .filter({ hasText: '=tx1' })
    .click({ button: 'right' })
  await page.getByText('View feature history').click({ timeout: 10_000 })

  const dialog = page.locator('[data-testid="feature-changelog"]')
  await expect(dialog).toBeVisible({ timeout: 5_000 })

  // The dialog title should mention tx1 and its parent gene
  await expect(dialog.getByText(/Feature history.*mRNA/)).toBeVisible()

  await dialog.getByRole('button', { name: 'Close' }).click()
})
