import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  addAssemblyFromGff,
  downloadGff,
  loginAsRoot,
  resetDatabase,
} from './helpers.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const GFF_PATH = path.resolve(__dirname, '../test_data/volvox.fasta.gff3')

test.beforeEach(async ({ page }) => {
  await resetDatabase()
  await loginAsRoot(page)
})

test.afterEach(async ({ page }) => {
  await page.goto('about:blank')
})

test('Can download gff with fasta', async ({ page }) => {
  await addAssemblyFromGff(page, 'volvox.fasta.gff3', GFF_PATH)
  const body = await downloadGff(page, 'volvox.fasta.gff3', true)
  const lines = body.trim().split('\n')
  expect(lines.length).toBe(934)
})

test('Can download gff without fasta', async ({ page }) => {
  await addAssemblyFromGff(page, 'volvox.fasta.gff3', GFF_PATH)
  const body = await downloadGff(page, 'volvox.fasta.gff3', false)
  const lines = body.trim().split('\n')
  expect(lines.length).toBe(229)
})
