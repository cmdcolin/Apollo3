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

  // Verify mrna03 is visible
  await expect(page.getByText('Id=mrna03,')).toBeVisible()

  // Right-click mrna02 and merge
  await page.getByText('Id=mrna02').click({ button: 'right', force: true })
  await page
    .getByText('Merge transcripts', { exact: false })
    .click({ timeout: 10_000 })

  // Select mrna03 (y [5-30])
  await page.getByText('y [5-30]').locator('..').locator('input').click()
  await page.getByRole('button', { name: 'Submit' }).click()

  // Check merged result
  const mrna02Row = page.getByText('Id=mrna02').locator('..')
  await expect(mrna02Row.getByText('3')).toBeVisible()
  await expect(mrna02Row.getByText('30')).toBeVisible()
  await expect(
    mrna02Row.getByText(
      'Id=mrna02, Name=x, merged_with=Id%3Dmrna03%3BName%3Dy',
    ),
  ).toBeVisible()

  const exon1Row = page.getByText('Id=exon1').locator('..')
  await expect(exon1Row.getByText('3')).toBeVisible()
  await expect(exon1Row.getByText('15')).toBeVisible()

  const cds1Row = page.getByText('Id=cds1').locator('..')
  await expect(cds1Row.getByText('4')).toBeVisible()
  await expect(cds1Row.getByText('29')).toBeVisible()

  // mrna03 should be gone after merge
  await expect(page.getByText('Id=mrna03,')).not.toBeVisible()

  // Merge mrna05 into mrna02
  await page.getByText('Id=mrna02').click({ button: 'right', force: true })
  await page
    .getByText('Merge transcripts', { exact: false })
    .click({ timeout: 10_000 })
  await page.getByText('mrna05 [26-40]').locator('..').locator('input').click()
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByText('Id=mrna05,')).not.toBeVisible()

  await expect(
    page.getByText(
      'Id=mrna02, Name=x, merged_with=Id%3Dmrna03%3BName%3Dy, Id%3Dmrna05',
    ),
  ).toBeVisible()

  // Close view and reload to verify persistence
  await page.locator('button[data-testid="close_view"]').click()
  await expect(page.getByText('Launch view')).toBeVisible()
  await page.goto('/jbrowse/')
  await expect(page.getByRole('button', { name: 'Launch view' })).toBeVisible({
    timeout: 15_000,
  })
  await page.getByRole('button', { name: 'Launch view' }).click()
  await expect(page.getByText('Select assembly to view')).toBeVisible({
    timeout: 10_000,
  })

  await selectAssemblyToView(page, ASSEMBLY, 'chr2:1..60')
  await annotationTrackAppearance(page, 'Show both graphical and table display')

  await expect(
    page.getByText(
      'Id=mrna02, Name=x, merged_with=Id%3Dmrna03%3BName%3Dy, Id%3Dmrna05',
    ),
  ).toBeVisible()
  await expect(
    page.getByText(
      'Id=exon2, Name=b, merged_with=Id%3Dexon5%3BName%3Dg, Id%3Dexon10',
    ),
  ).toBeVisible()
})
