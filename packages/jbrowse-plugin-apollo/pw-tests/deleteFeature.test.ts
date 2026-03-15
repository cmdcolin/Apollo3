import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  addAssemblyFromGff,
  annotationTrackAppearance,
  deleteAssemblies,
  loginAsGuest,
  selectAssemblyToView,
} from './helpers.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const GFF_PATH = path.resolve(__dirname, '../test_data/deleteFeature.gff3')

test.beforeEach(async ({ page }) => {
  await loginAsGuest(page)
})

test.afterEach(async ({ page }) => {
  // Navigate away to close the websocket connection before cleanup.
  // Otherwise the websocket holds the SQLite connection and API calls deadlock.
  await page.goto('about:blank')
  await deleteAssemblies()
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
  const featureEl = page.getByText(featureName)
  await featureEl.click({ button: 'right', force: true })
  await page.getByText('Delete feature', { exact: false }).click()
  await page.getByRole('button', { name: 'Yes' }).click()
  await expect(page.locator('.MuiDialog-root')).not.toBeVisible({
    timeout: 10_000,
  })
}

async function refreshTableEditor(page: import('@playwright/test').Page) {
  // Toggle table display to refresh
  const trackMenu = page.locator('[data-testid="track_menu_icon"]').first()
  await trackMenu.click()
  await page.getByText('Show graphical display').click()
  await trackMenu.click()
  await page.getByText('Show both graphical and table display').click()
}

test('Delete and resize', async ({ page }) => {
  await setupDeleteFeatureTest(page)

  // Delete exon01 and check features are updated
  await deleteFeatureByName(page, 'Id=exon01')
  await refreshTableEditor(page)

  const gene02Row = page.getByText('Id=gene02').locator('..')
  await expect(gene02Row.locator('input[value="10"]')).toBeVisible()
  await expect(gene02Row.locator('input[value="200"]')).toBeVisible()

  const mrna02Row = page.getByText('Id=mrna02').locator('..')
  await expect(mrna02Row.locator('input[value="50"]')).toBeVisible()

  const cds1Row = page.getByText('Id=cds1').locator('..')
  await expect(cds1Row.locator('input[value="50"]')).toBeVisible()
  await expect(cds1Row.locator('input[value="140"]')).toBeVisible()

  const mrna03Row = page.getByText('Id=mrna03').locator('..')
  await expect(mrna03Row.locator('input[value="10"]')).toBeVisible()
  await expect(mrna03Row.locator('input[value="190"]')).toBeVisible()

  // Delete exon05
  await deleteFeatureByName(page, 'Id=exon05')

  await expect(
    page.getByText('Id=gene02').locator('..').locator('input[value="50"]'),
  ).toBeVisible()
  await expect(
    page.getByText('Id=gene02').locator('..').locator('input[value="200"]'),
  ).toBeVisible()
  await expect(
    page.getByText('Id=mrna03').locator('..').locator('input[value="50"]'),
  ).toBeVisible()
  await expect(
    page.getByText('Id=mrna03').locator('..').locator('input[value="190"]'),
  ).toBeVisible()

  // Delete from right
  await deleteFeatureByName(page, 'Id=exon09')
  await expect(
    page.getByText('Id=gene02').locator('..').locator('input[value="50"]'),
  ).toBeVisible()
  await expect(
    page.getByText('Id=gene02').locator('..').locator('input[value="190"]'),
  ).toBeVisible()

  await deleteFeatureByName(page, 'Id=exon04')
  await refreshTableEditor(page)
  await expect(
    page.getByText('Id=mrna02').locator('..').locator('input[value="150"]'),
  ).toBeVisible()

  await deleteFeatureByName(page, 'Id=exon03')
  await refreshTableEditor(page)
  await expect(
    page.getByText('Id=mrna02').locator('..').locator('input[value="115"]'),
  ).toBeVisible()
  await expect(
    page.getByText('Id=cds1').locator('..').locator('input[value="115"]'),
  ).toBeVisible()

  // No side effect in deleting "exon_region"
  await deleteFeatureByName(page, 'Id=exon_region2')
  await deleteFeatureByName(page, 'Id=exon_region1')
  await refreshTableEditor(page)
  await expect(
    page.getByText('Id=exon08').locator('..').locator('input[value="160"]'),
  ).toBeVisible()
  await expect(
    page.getByText('Id=exon08').locator('..').locator('input[value="190"]'),
  ).toBeVisible()

  await deleteFeatureByName(page, 'Id=cds1')
  await refreshTableEditor(page)
  await expect(
    page.getByText('Id=mrna02').locator('..').locator('input[value="50"]'),
  ).toBeVisible()
  await expect(
    page.getByText('Id=mrna02').locator('..').locator('input[value="115"]'),
  ).toBeVisible()

  await deleteFeatureByName(page, 'Id=exon02')
  await deleteFeatureByName(page, 'Id=exon10')
  await refreshTableEditor(page)
  await expect(
    page.getByText('Id=mrna02').locator('..').locator('input[value="105"]'),
  ).toBeVisible()
  await expect(
    page.getByText('Id=mrna02').locator('..').locator('input[value="115"]'),
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
