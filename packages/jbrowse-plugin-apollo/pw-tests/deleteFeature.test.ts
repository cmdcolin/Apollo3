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
const GFF_PATH = path.resolve(__dirname, '../test_data/deleteFeature.gff3')

test.beforeEach(async ({ page }) => {
  await resetDatabase()
  await loginAsRoot(page)
})

test.afterEach(async ({ page }) => {
  await page.goto('about:blank')
})

async function setupDeleteFeatureTest(page: import('@playwright/test').Page) {
  await addAssemblyFromGff(page, 'deleteFeature.gff3', GFF_PATH)
  await selectAssemblyToView(page, 'deleteFeature.gff3', 'chr2:1..250')
  await annotationTrackAppearance(page, 'Show both graphical and table display')
  // Wait for features to load in the table
  await expect(page.getByText('Id=gene02')).toBeVisible({ timeout: 30_000 })
  console.log('[setup] Features loaded in table')
}

async function deleteFeatureByName(
  page: import('@playwright/test').Page,
  featureName: string,
) {
  const featureEl = page.getByText(featureName).first()
  await featureEl.click({ button: 'right', force: true })
  await page.getByText('Delete feature', { exact: false }).click()
  await page.getByRole('button', { name: 'Yes' }).click()
  await expect(page.locator('.MuiDialog-root')).not.toBeVisible({
    timeout: 10_000,
  })
}


test('Delete and resize', async ({ page }) => {
  await setupDeleteFeatureTest(page)

  // Delete exon01 (3-40) from mrna02. Bounds recalculated from remaining children.
  // mrna02's min child is now CDS at 20-40, so mrna02 → 20-200
  // gene02 min comes from mrna03 exon05 at 10-40, so gene02 → 10-200
  await deleteFeatureByName(page, 'Id=exon01')
  await refreshTableEditor(page)

  await expect(
    page.getByText('Id=gene02').locator('..').locator('input[value="10"]'),
  ).toBeVisible()
  await expect(
    page.getByText('Id=gene02').locator('..').locator('input[value="200"]'),
  ).toBeVisible()
  await expect(
    page.getByText('Id=mrna02').locator('..').locator('input[value="20"]'),
  ).toBeVisible()
  await expect(
    page.getByText('Id=mrna03').locator('..').locator('input[value="10"]'),
  ).toBeVisible()
  await expect(
    page.getByText('Id=mrna03').locator('..').locator('input[value="190"]'),
  ).toBeVisible()

  // Delete exon05 (10-40) from mrna03. mrna03 → 50-190, gene02 → 20-200
  await deleteFeatureByName(page, 'Id=exon05')
  await refreshTableEditor(page)

  await expect(
    page.getByText('Id=gene02').locator('..').locator('input[value="20"]'),
  ).toBeVisible()
  await expect(
    page.getByText('Id=gene02').locator('..').locator('input[value="200"]'),
  ).toBeVisible()
  await expect(
    page.getByText('Id=mrna03').locator('..').locator('input[value="50"]'),
  ).toBeVisible()

  // Delete exon09 (190-200) from mrna02. mrna02 → 20-180, gene02 → 20-190
  await deleteFeatureByName(page, 'Id=exon09')
  await refreshTableEditor(page)

  await expect(
    page.getByText('Id=gene02').locator('..').locator('input[value="20"]'),
  ).toBeVisible()
  await expect(
    page.getByText('Id=gene02').locator('..').locator('input[value="190"]'),
  ).toBeVisible()
  await expect(
    page.getByText('Id=mrna02').locator('..').locator('input[value="180"]'),
  ).toBeVisible()

  // Delete exon04 (160-180). mrna02 → 20-150
  await deleteFeatureByName(page, 'Id=exon04')
  await refreshTableEditor(page)
  await expect(
    page.getByText('Id=mrna02').locator('..').locator('input[value="150"]'),
  ).toBeVisible()

  // Delete exon03 (120-150). mrna02 → 20-140
  await deleteFeatureByName(page, 'Id=exon03')
  await refreshTableEditor(page)
  await expect(
    page.getByText('Id=mrna02').locator('..').locator('input[value="140"]'),
  ).toBeVisible()

  // No side effect in deleting exon_region children
  await deleteFeatureByName(page, 'Id=exon_region2')
  await deleteFeatureByName(page, 'Id=exon_region1')
  await refreshTableEditor(page)
  await expect(
    page.getByText('Id=exon08').locator('..').locator('input[value="160"]'),
  ).toBeVisible()

  // Delete cds1 (first CDS at 20-40). After this, mrna02 → 50-140
  await deleteFeatureByName(page, 'Id=cds1')
  await refreshTableEditor(page)
  await expect(
    page.getByText('Id=mrna02').locator('..').locator('input[value="50"]'),
  ).toBeVisible()
  await expect(
    page.getByText('Id=mrna02').locator('..').locator('input[value="140"]'),
  ).toBeVisible()

  // Delete exon02 and exon10. mrna02 → 50-140 (CDS parts remain)
  await deleteFeatureByName(page, 'Id=exon02')
  await deleteFeatureByName(page, 'Id=exon10')
  await refreshTableEditor(page)
  await expect(
    page.getByText('Id=mrna02').locator('..').locator('input[value="50"]'),
  ).toBeVisible()
  await expect(
    page.getByText('Id=mrna02').locator('..').locator('input[value="140"]'),
  ).toBeVisible()
})

test('Delete internal exon', async ({ page }) => {
  await setupDeleteFeatureTest(page)

  await deleteFeatureByName(page, 'Id=exon03')
  await refreshTableEditor(page)
  await expect(
    page.getByText('Id=cds1').locator('..').locator('input[value="115"]'),
  ).toBeVisible()
})
