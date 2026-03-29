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

async function editCds1EndValue(
  page: import('@playwright/test').Page,
  currentValue: string,
  newValue: string,
) {
  const tbody = page.locator('tbody')
  await expect(tbody).toBeVisible({ timeout: 10_000 })
  const cds1Row = tbody.locator('tr').filter({ hasText: 'CDS1' })
  // Wait for the row to appear and have inputs (table may take time to render)
  await expect(cds1Row.locator('input').first()).toBeVisible({ timeout: 30_000 })
  const inputs = cds1Row.locator('input')
  const count = await inputs.count()
  for (let i = 0; i < count; i++) {
    const val = await inputs.nth(i).inputValue()
    if (val === currentValue) {
      const saveResponse = page.waitForResponse(
        (resp) =>
          resp.url().includes('/features') && resp.status() === 200,
      )
      await inputs.nth(i).fill(newValue)
      // Click outside to trigger blur/save
      await page.click('body', { position: { x: 0, y: 0 } })
      await saveResponse.catch(() => {})
      return
    }
  }
  const allValues = []
  for (let i = 0; i < count; i++) {
    allValues.push(await inputs.nth(i).inputValue())
  }
  throw new Error(
    `No input with value "${currentValue}" found in CDS1 row (found: ${allValues.join(', ')})`,
  )
}

async function expectCds1HasValue(
  page: import('@playwright/test').Page,
  value: string,
) {
  const tbody = page.locator('tbody')
  await expect(tbody).toBeVisible({ timeout: 10_000 })
  const cds1Row = tbody.locator('tr').filter({ hasText: 'CDS1' })
  // Check the End input's current value
  const endInput = cds1Row.locator('input').nth(2)
  await expect(endInput).toHaveValue(value, { timeout: 10_000 })
}

test('Undo chain of edits', async ({ page }) => {
  await setupUndoTest(page)

  // Edit end: 99 -> 90
  await editCds1EndValue(page, '99', '90')
  await refreshTableEditor(page)

  // Edit: 90 -> 80
  await editCds1EndValue(page, '90', '80')

  // An invalid edit (start > end)
  await editCds1EndValue(page, '1', '95')
  await expect(
    page.getByText('Error: Min "95" is greater than max "80"'),
  ).toBeVisible()

  await refreshTableEditor(page)

  // Edit: 80 -> 70
  await editCds1EndValue(page, '80', '70')

  // Undo chain
  await selectFromApolloMenu(page, ['Undo'])
  await refreshTableEditor(page)
  await expectCds1HasValue(page, '80')

  await selectFromApolloMenu(page, ['Undo'])
  await refreshTableEditor(page)
  await expectCds1HasValue(page, '90')

  await selectFromApolloMenu(page, ['Undo'])
  await refreshTableEditor(page)
  await expectCds1HasValue(page, '99')

  await selectFromApolloMenu(page, ['Undo'])
  await expect(page.getByText('No changes to undo')).toBeVisible()
})

test('Undo and redo', async ({ page }) => {
  await setupUndoTest(page)

  // Edit start: 1 -> 10
  await editCds1EndValue(page, '1', '10')
  await refreshTableEditor(page)

  // Edit: 10 -> 20
  await editCds1EndValue(page, '10', '20')
  await refreshTableEditor(page)

  // Edit: 20 -> 30
  await editCds1EndValue(page, '20', '30')

  await selectFromApolloMenu(page, ['Undo'])
  await refreshTableEditor(page)
  await expectCds1HasValue(page, '20')

  await selectFromApolloMenu(page, ['Undo'])
  await refreshTableEditor(page)
  await expectCds1HasValue(page, '10')

  // New edit after undo clears redo stack
  await editCds1EndValue(page, '10', '40')
  await refreshTableEditor(page)

  await selectFromApolloMenu(page, ['Redo'])
  await expect(page.getByText('No changes to redo')).toBeVisible()

  await selectFromApolloMenu(page, ['Undo'])
  await refreshTableEditor(page)
  await expectCds1HasValue(page, '10')

  await selectFromApolloMenu(page, ['Undo'])
  await refreshTableEditor(page)
  await expectCds1HasValue(page, '1')

  await selectFromApolloMenu(page, ['Redo'])
  await refreshTableEditor(page)
  await expectCds1HasValue(page, '10')

  await selectFromApolloMenu(page, ['Redo'])
  await refreshTableEditor(page)
  await expectCds1HasValue(page, '40')

  await selectFromApolloMenu(page, ['Redo'])
  await expect(page.getByText('No changes to redo')).toBeVisible()
})
