import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  addAssemblyFromGff,
  annotationTrackAppearance,
  loginAsRoot,
  refreshTableEditor,
  resetDatabase,
  selectAssemblyToView,
} from './helpers.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

test.beforeEach(async ({ page }) => {
  await resetDatabase()
  await loginAsRoot(page)
})

test.afterEach(async ({ page }) => {
  await page.goto('about:blank')
})

test('Edit feature via table editor', async ({ page }) => {
  const assemblyName = 'space.gff3'
  const gffPath = path.resolve(__dirname, `../test_data/${assemblyName}`)
  await addAssemblyFromGff(page, assemblyName, gffPath)
  await selectAssemblyToView(page, assemblyName, 'ctgA:9400..9600')
  await annotationTrackAppearance(page, 'Show both graphical and table display')

  const tbody = page.locator('tbody')
  await expect(tbody).toBeVisible({ timeout: 10_000 })

  const match5Row = tbody.locator('tr').filter({ hasText: 'Match5' })

  // Change type from EST_match to CDS
  const typeInput = match5Row.locator('input[type="text"]').first()
  await typeInput.fill('CDS')
  await typeInput.press('Enter')

  // Change start coordinate
  const startCell = match5Row.locator('td').filter({ hasText: '9520' })
  const startInput = startCell.locator('input')
  await startInput.fill('9432')

  // Change end coordinate
  const endCell = match5Row.locator('td').filter({ hasText: '9900' })
  const endInput = endCell.locator('input')
  await endInput.fill('9567')

  // Click outside to trigger save
  await page.click('body', { position: { x: 0, y: 0 } })
  await page.waitForResponse(
    (resp) => resp.url().includes('/features') && resp.status() === 200,
  )

  // Verify edits persisted after reload
  await page.reload()
  const reloadedTbody = page.locator('tbody')
  await expect(reloadedTbody).toBeVisible({ timeout: 10_000 })
  await expect(
    reloadedTbody.locator('input[type="text"][value="CDS"]'),
  ).toBeVisible()
  await expect(reloadedTbody.getByText('9432')).toBeVisible()
  await expect(reloadedTbody.getByText('9567')).toBeVisible()
})

test('Can delete feature', async ({ page }) => {
  const gffPath = path.resolve(__dirname, '../test_data/onegene.fasta.gff3')
  await addAssemblyFromGff(page, 'onegene.fasta.gff3', gffPath)
  await selectAssemblyToView(page, 'onegene.fasta.gff3', 'gx1')
  await annotationTrackAppearance(page, 'Show both graphical and table display')

  const tbody = page.locator('tbody')
  await expect(tbody.getByText('=CDS1')).toBeVisible({ timeout: 10_000 })

  // Right-click tx1 and delete
  await tbody.getByText('=tx1').click({ button: 'right' })
  await page.getByText('Delete feature').click()
  await page
    .getByText('Are you sure you want to delete the selected feature?')
    .locator('..')
    .locator('..')
    .getByRole('button', { name: /^yes$/i })
    .click()

  await expect(tbody.getByText('=gx1')).toBeVisible()
  await expect(tbody.getByText('=tx1')).not.toBeVisible()
  await expect(tbody.getByText('=CDS1')).not.toBeVisible()
})

test('Suggest only valid SO terms from dropdown', async ({ page }) => {
  const gffPath = path.resolve(__dirname, '../test_data/onegene.fasta.gff3')
  await addAssemblyFromGff(page, 'onegene.fasta.gff3', gffPath)
  await selectAssemblyToView(page, 'onegene.fasta.gff3', 'gx1')
  await annotationTrackAppearance(page, 'Show both graphical and table display')

  const cdsInput = page.locator('input[type="text"][value="CDS"]')
  await expect(cdsInput).toBeVisible({ timeout: 60_000 })
  await cdsInput.click({ force: true })

  // start_codon should be a valid child term
  await expect(
    page.locator('li').filter({ hasText: /^start_codon$/ }),
  ).toBeVisible({ timeout: 60_000 })

  // gene should NOT appear as a valid child of CDS
  await expect(
    page.locator('li').filter({ hasText: /^gene$/ }),
  ).not.toBeVisible({ timeout: 5_000 })
})
