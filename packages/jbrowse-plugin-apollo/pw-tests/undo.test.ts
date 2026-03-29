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
  selectFromApolloMenu,
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

async function setupUndoTest(page: import('@playwright/test').Page) {
  await addAssemblyFromGff(page, ASSEMBLY, GFF_PATH)
  await selectAssemblyToView(page, ASSEMBLY, 'gx1')
  await annotationTrackAppearance(page, 'Show both graphical and table display')
}

// Table columns: type(td 0), start(td 1), end(td 2), strand(td 3), attributes(td 4)
// Using position-based targeting avoids race conditions with the async
// OntologyTermAutocomplete input that can shift input indices.
async function editCds1Field(
  page: import('@playwright/test').Page,
  column: 'start' | 'end',
  currentValue: string,
  newValue: string,
) {
  const tdIndex = column === 'start' ? 1 : 2
  const tbody = page.locator('tbody')
  await expect(tbody).toBeVisible({ timeout: 10_000 })
  const cds1Row = tbody.locator('tr').filter({ hasText: 'CDS1' })
  const input = cds1Row.locator('td').nth(tdIndex).locator('input')
  await expect(input).toBeVisible({ timeout: 30_000 })
  await expect(input).toHaveValue(currentValue, { timeout: 10_000 })

  const patchResponse = page.waitForResponse(
    (resp) =>
      resp.url().includes('/features') && resp.request().method() === 'PATCH' && resp.status() === 200,
  )
  await input.fill(newValue)
  await page.click('body', { position: { x: 0, y: 0 } })
  await patchResponse
}

async function expectCds1HasEnd(
  page: import('@playwright/test').Page,
  value: string,
) {
  const tbody = page.locator('tbody')
  await expect(tbody).toBeVisible({ timeout: 10_000 })
  const cds1Row = tbody.locator('tr').filter({ hasText: 'CDS1' })
  const endInput = cds1Row.locator('td').nth(2).locator('input')
  await expect(endInput).toHaveValue(value, { timeout: 30_000 })
}

async function expectCds1HasStart(
  page: import('@playwright/test').Page,
  value: string,
) {
  const tbody = page.locator('tbody')
  await expect(tbody).toBeVisible({ timeout: 10_000 })
  const cds1Row = tbody.locator('tr').filter({ hasText: 'CDS1' })
  const startInput = cds1Row.locator('td').nth(1).locator('input')
  await expect(startInput).toHaveValue(value, { timeout: 30_000 })
}

async function undoAndWait(page: import('@playwright/test').Page) {
  const resp = page.waitForResponse((r) => r.url().includes('/features/undo'))
  await selectFromApolloMenu(page, ['Edit', 'Undo'])
  await resp
}

async function redoAndWait(page: import('@playwright/test').Page) {
  const resp = page.waitForResponse((r) => r.url().includes('/features/undo'))
  await selectFromApolloMenu(page, ['Edit', 'Redo'])
  await resp
}

test('Undo chain of edits', async ({ page }) => {
  await setupUndoTest(page)

  await editCds1Field(page, 'end', '99', '90')
  await refreshTableEditor(page)

  await editCds1Field(page, 'end', '90', '80')
  await refreshTableEditor(page)

  await editCds1Field(page, 'end', '80', '70')

  await undoAndWait(page)
  await expectCds1HasEnd(page, '80')

  await undoAndWait(page)
  await expectCds1HasEnd(page, '90')

  await undoAndWait(page)
  await expectCds1HasEnd(page, '99')

  await selectFromApolloMenu(page, ['Edit', 'Undo'])
  await expect(page.getByText(/No changes to undo/)).toBeVisible()
})

test('Undo and redo', async ({ page }) => {
  await setupUndoTest(page)

  await editCds1Field(page, 'start', '1', '10')
  await refreshTableEditor(page)

  await editCds1Field(page, 'start', '10', '20')
  await refreshTableEditor(page)

  await editCds1Field(page, 'start', '20', '30')

  await undoAndWait(page)
  await expectCds1HasStart(page, '20')

  await undoAndWait(page)
  await expectCds1HasStart(page, '10')

  // New edit after undo clears redo stack
  await editCds1Field(page, 'start', '10', '40')
  await refreshTableEditor(page)

  await selectFromApolloMenu(page, ['Edit', 'Redo'])
  await expect(page.getByText(/No changes to redo/)).toBeVisible()
  // Dismiss notification so it doesn't block the next menu click
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)

  await undoAndWait(page)
  await expectCds1HasStart(page, '10')

  await undoAndWait(page)
  await expectCds1HasStart(page, '1')

  await redoAndWait(page)
  await expectCds1HasStart(page, '10')

  await redoAndWait(page)
  await expectCds1HasStart(page, '40')

  await selectFromApolloMenu(page, ['Edit', 'Redo'])
  await expect(page.getByText(/No changes to redo/)).toBeVisible()
})
