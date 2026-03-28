import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  addAssemblyFromGff,
  currentLocationEquals,
  deleteAssemblies,
  loginAsRoot,
  searchFeatures,
  selectAssemblyToView,
} from './helpers.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

test.describe('space.gff3 searches', () => {
  const GFF_PATH = path.resolve(__dirname, '../test_data/space.gff3')

  test.beforeEach(async ({ page }) => {
    await loginAsRoot(page)
  })

  test.afterEach(async ({ page }) => {
    await page.goto('about:blank')
    await deleteAssemblies()
  })

  test('Full word and word stem matching', async ({ page }) => {
    await addAssemblyFromGff(page, 'space.gff3', GFF_PATH)
    await selectAssemblyToView(page, 'space.gff3', 'ctgA:1..10000')

    await searchFeatures(page, 'transmem', 0)
    await searchFeatures(page, 'transmembrane', 1)
    await currentLocationEquals(page, 'ctgA', 9444, 9976, 10)
    await searchFeatures(page, '7-transmembrane', 1)
    await searchFeatures(page, 'someKeyWord', 1)
    await searchFeatures(page, 'mRNA', 1)
    await searchFeatures(page, 'UTRs', 1)
    await searchFeatures(page, 'UTR', 1)
    await searchFeatures(page, 'with', 0)
    await searchFeatures(page, 'both', 0)
    await searchFeatures(page, 'and', 0)
  })

  test('Can handle space in attribute values', async ({ page }) => {
    await addAssemblyFromGff(page, 'space.gff3', GFF_PATH)
    await selectAssemblyToView(page, 'space.gff3', 'ctgA:1..10000')

    await searchFeatures(page, 'agt 2', 1)
    await currentLocationEquals(page, 'ctgA', 1, 8410, 10)

    await searchFeatures(page, 'thisDoesNotExist', 0)
    await currentLocationEquals(page, 'ctgA', 1, 8410, 10)

    await searchFeatures(page, 'agt B', 1)
    await currentLocationEquals(page, 'ctgA', 7800, 9200, 10)

    await searchFeatures(page, 'agt 1', 2)
  })
})

test.describe('volvox.fasta.gff3 searches', () => {
  const GFF_PATH = path.resolve(__dirname, '../test_data/volvox.fasta.gff3')

  test.beforeEach(async ({ page }) => {
    await loginAsRoot(page)
  })

  test.afterEach(async ({ page }) => {
    await page.goto('about:blank')
    await deleteAssemblies()
  })

  test('One hit with no children', async ({ page }) => {
    await addAssemblyFromGff(page, 'volvox.fasta.gff3', GFF_PATH)
    await selectAssemblyToView(page, 'volvox.fasta.gff3', 'Match6')
    await currentLocationEquals(page, 'ctgA', 7800, 9200, 10)
  })

  test('Match is not case sensitive', async ({ page }) => {
    await addAssemblyFromGff(page, 'volvox.fasta.gff3', GFF_PATH)
    await selectAssemblyToView(page, 'volvox.fasta.gff3', 'match6')
    await currentLocationEquals(page, 'ctgA', 7800, 9200, 10)
  })

  test('Decode URL escapes', async ({ page }) => {
    await addAssemblyFromGff(page, 'volvox.fasta.gff3', GFF_PATH)
    await selectAssemblyToView(page, 'volvox.fasta.gff3', 'ctgA:1..10000')
    await searchFeatures(page, 'Some%2CNote', 0)
    await searchFeatures(page, 'Some,Note', 1)
    await currentLocationEquals(page, 'ctgA', 800, 2200, 10)
  })

  test('One matching parent and multiple matching children', async ({
    page,
  }) => {
    await addAssemblyFromGff(page, 'volvox.fasta.gff3', GFF_PATH)
    await selectAssemblyToView(page, 'volvox.fasta.gff3', 'EDEN')
    await currentLocationEquals(page, 'ctgA', 1, 10_590, 10)
  })

  test('Select from multiple hits', async ({ page }) => {
    await addAssemblyFromGff(page, 'volvox.fasta.gff3', GFF_PATH)
    await selectAssemblyToView(page, 'volvox.fasta.gff3', 'ctgA:1..10000')
    await searchFeatures(page, 'hga', 3)

    const row = page
      .locator('td')
      .filter({ hasText: 'ctgA:1,000..2,000' })
      .locator('..')
    await row.getByRole('button', { name: /^Go$/i }).click()
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})
    await currentLocationEquals(page, 'ctgA', 800, 2200, 10)

    await searchFeatures(page, 'hgb', 2)
  })
})
