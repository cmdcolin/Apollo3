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
const GFF_PATH = path.resolve(__dirname, '../test_data/onegene.fasta.gff3')
const ASSEMBLY = 'onegene.fasta.gff3'

test.beforeEach(async ({ page }) => {
  await resetDatabase()
  await loginAsRoot(page)
})

test.afterEach(async ({ page }) => {
  await page.goto('about:blank')
})

test('View feature history opens changes page for a gene', async ({
  page,
  context,
}) => {
  await addAssemblyFromGff(page, ASSEMBLY, GFF_PATH)
  await selectAssemblyToView(page, ASSEMBLY, 'gx1')
  await annotationTrackAppearance(page, 'Show both graphical and table display')

  const tbody = page.locator('tbody')
  await expect(tbody).toBeVisible({ timeout: 10_000 })

  // Make an edit so the history has at least one entry
  const cds1Row = tbody.locator('tr').filter({ hasText: 'CDS1' })
  const endInput = cds1Row.locator('input').nth(2)
  await endInput.fill('95')
  await endInput.press('Enter')
  await page.waitForResponse(
    (resp) => resp.url().includes('/features') && resp.status() === 200,
  )

  await refreshTableEditor(page)
  await expect(tbody).toBeVisible({ timeout: 10_000 })

  // Right-click on the gene feature and open "View feature history"
  await tbody
    .locator('tr')
    .filter({ hasText: 'ID=gx1' })
    .click({ button: 'right' })

  // Listen for the new page (tab) that opens
  const pagePromise = context.waitForEvent('page')
  await page.getByText('View feature history').click({ timeout: 10_000 })

  const changesPage = await pagePromise
  await changesPage.waitForLoadState()

  // The URL should contain /ui/changes/ with geneId query param
  expect(changesPage.url()).toContain('/ui/changes/')
  expect(changesPage.url()).toContain('geneId=')

  // The page should show a data grid with history records
  await expect(changesPage.locator('[role="grid"]')).toBeVisible({
    timeout: 10_000,
  })
})

test('Recent changes page shows history entries', async ({ page }) => {
  await addAssemblyFromGff(page, ASSEMBLY, GFF_PATH)
  await selectAssemblyToView(page, ASSEMBLY, 'gx1')
  await annotationTrackAppearance(page, 'Show both graphical and table display')

  const tbody = page.locator('tbody')
  await expect(tbody).toBeVisible({ timeout: 10_000 })

  // Make an edit
  const cds1Row = tbody.locator('tr').filter({ hasText: 'CDS1' })
  const endInput = cds1Row.locator('input').nth(2)
  await endInput.fill('90')
  await endInput.press('Enter')
  await page.waitForResponse(
    (resp) => resp.url().includes('/features') && resp.status() === 200,
  )

  // Navigate to the changes page directly
  await page.goto('/ui/changes/')
  await page.waitForLoadState()

  await expect(page.getByText('Recent Changes')).toBeVisible({
    timeout: 10_000,
  })

  // The grid should have at least one row
  const grid = page.locator('[role="grid"]')
  await expect(grid).toBeVisible({ timeout: 10_000 })
  const dataRows = grid
    .locator('[role="row"]')
    .filter({ hasNot: page.locator('[role="columnheader"]') })
  await expect(dataRows).not.toHaveCount(0, { timeout: 10_000 })
})

test('Gene history page filters by feature ID', async ({ page }) => {
  await addAssemblyFromGff(page, ASSEMBLY, GFF_PATH)
  await selectAssemblyToView(page, ASSEMBLY, 'gx1')
  await annotationTrackAppearance(page, 'Show both graphical and table display')

  const tbody = page.locator('tbody')
  await expect(tbody).toBeVisible({ timeout: 10_000 })

  // Make an edit to CDS1
  const cds1Row = tbody.locator('tr').filter({ hasText: 'CDS1' })
  const endInput = cds1Row.locator('input').nth(2)
  await endInput.fill('80')
  await endInput.press('Enter')
  await page.waitForResponse(
    (resp) => resp.url().includes('/features') && resp.status() === 200,
  )

  await refreshTableEditor(page)
  await expect(tbody).toBeVisible({ timeout: 10_000 })

  // Get the gene feature's internal ID from the context menu link
  await tbody
    .locator('tr')
    .filter({ hasText: 'ID=gx1' })
    .click({ button: 'right' })

  const pagePromise = page.context().waitForEvent('page')
  await page.getByText('View feature history').click({ timeout: 10_000 })
  const changesPage = await pagePromise
  await changesPage.waitForLoadState()

  // Should show "Gene History" heading (not "Recent Changes")
  await expect(changesPage.getByText('Gene History')).toBeVisible({
    timeout: 10_000,
  })

  // The grid should have history rows for the gene's children
  const grid = changesPage.locator('[role="grid"]')
  await expect(grid).toBeVisible({ timeout: 10_000 })
  const dataRows = grid
    .locator('[role="row"]')
    .filter({ hasNot: changesPage.locator('[role="columnheader"]') })
  await expect(dataRows).not.toHaveCount(0, { timeout: 10_000 })
})
