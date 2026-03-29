import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  addAssemblyFromGff,
  annotationTrackAppearance,
  currentLocationEquals,
  loginAsRoot,
  refreshTableEditor,
  resetDatabase,
  searchFeatures,
  selectAssemblyToView,
  selectFromApolloMenu,
} from './helpers.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const GFF_PATH = path.resolve(__dirname, '../test_data/SM_V10_3.fasta.gff3.gz')
const ASSEMBLY = 'SM_V10_3.fasta.gff3.gz'

test.beforeEach(async ({ page }) => {
  await resetDatabase()
  await loginAsRoot(page)
})

test.afterEach(async ({ page }) => {
  await page.goto('about:blank')
})

test('Navigate to feature from table editor', async ({ page }) => {
  await addAssemblyFromGff(page, ASSEMBLY, GFF_PATH)
  await selectAssemblyToView(page, ASSEMBLY, 'gene:Smp_313440')
  await annotationTrackAppearance(page, 'Show both graphical and table display')

  // Double-click exon to navigate
  await page
    .locator('td')
    .filter({ hasText: 'exon:Smp_313440.1.1' })
    .dblclick({ force: true })
  await currentLocationEquals(page, 'SM_V10_3', 192_138, 192_275, 50)

  await page
    .locator('td')
    .filter({ hasText: 'exon:Smp_313440.1.13' })
    .dblclick({ force: true })
  await currentLocationEquals(page, 'SM_V10_3', 206_893, 207_445, 100)

  // Test refseq boundaries
  await searchFeatures(page, 'SM_V10_3:800..2000', 1)
  await page
    .locator('td')
    .filter({ hasText: 'region1' })
    .dblclick({ force: true })
  await currentLocationEquals(page, 'SM_V10_3', 1, 1300, 100)

  await searchFeatures(page, 'SM_V10_3:498000..499100', 1)
  await page
    .locator('td')
    .filter({ hasText: 'region2' })
    .dblclick({ force: true })
  await currentLocationEquals(page, 'SM_V10_3', 498_900, 500_000, 100)
  await expect(page.getByText('500,000')).toBeVisible()
})

test('Lock session prevents editing', async ({ page }) => {
  await addAssemblyFromGff(page, ASSEMBLY, GFF_PATH)
  await selectAssemblyToView(page, ASSEMBLY, 'gene:Smp_313440')
  await annotationTrackAppearance(page, 'Show both graphical and table display')

  // Edit a coordinate
  const input192150 = page.locator('input[type="text"][value="192150"]').first()
  await input192150.fill('192140')
  await input192150.press('Enter')
  await refreshTableEditor(page)

  // Lock session
  await selectFromApolloMenu(page, ['Lock/Unlock session'])
  const input192140 = page.locator('input[type="text"][value="192140"]').first()
  await input192140.fill('192130')
  await input192140.press('Enter')
  await refreshTableEditor(page)

  await expect(
    page.getByText('Cannot submit changes in locked mode'),
  ).toBeVisible()
  await expect(page.getByText('192140')).toBeVisible()
  await expect(page.locator('[data-testid="lock-icon"]')).toBeVisible()

  // Unlock session
  await selectFromApolloMenu(page, ['Lock/Unlock session'])
  const inputUnlocked = page
    .locator('input[type="text"][value="192140"]')
    .first()
  await inputUnlocked.fill('192130')
  await inputUnlocked.press('Enter')
  await refreshTableEditor(page)

  await expect(page.getByText('192130')).toBeVisible()
  await expect(page.locator('[data-testid="lock-icon"]')).not.toBeVisible()
})
