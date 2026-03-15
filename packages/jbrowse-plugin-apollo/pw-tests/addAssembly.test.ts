import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  deleteAssemblies,
  getGuestToken,
  loginAsGuest,
  selectFromApolloMenu,
} from './helpers.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEST_DATA = path.resolve(__dirname, '../test_data')

test.beforeEach(async ({ page }) => {
  await loginAsGuest(page)
})

test.afterEach(async ({ page }) => {
  await page.goto('about:blank')
  await deleteAssemblies()
})

async function assertAssemblyLoaded(
  page: import('@playwright/test').Page,
  assemblyName: string,
) {
  // After reload, verify the assembly appears in the "Select assembly to view" dropdown
  await expect(page.getByText('Select assembly to view')).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByText(assemblyName)).toBeVisible({ timeout: 10_000 })
}

async function addAssemblyViaMenu(page: import('@playwright/test').Page) {
  await selectFromApolloMenu(page, ['Admin', 'Add Assembly'])
}

async function fillAssemblyName(
  page: import('@playwright/test').Page,
  name: string,
) {
  await page
    .locator('form[data-testid="submit-form"]')
    .locator('input[type="TextField"]')
    .fill(name)
}

async function submitAndWaitForSuccess(page: import('@playwright/test').Page) {
  await page
    .locator('form[data-testid="submit-form"]')
    .locator('Button[data-testid="submit-button"]')
    .click()
  await expect(page.getByText('added successfully')).toBeVisible({
    timeout: 60_000,
  })
  await page.reload()
  await expect(page.getByRole('button', { name: 'Apollo' })).toBeEnabled({
    timeout: 15_000,
  })
  const launchButton = page.getByRole('button', { name: 'Launch view' })
  if (await launchButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await launchButton.click()
  }
}

test('Can add assembly and features from gff3', async ({ page }) => {
  await addAssemblyViaMenu(page)
  const form = page.locator('form[data-testid="submit-form"]')
  await fillAssemblyName(page, 'volvox')

  // Switch to GFF3 input panel
  await form.getByText('GFF3 input').click()
  await form
    .locator('input[data-testid="gff3-input-file"]')
    .setInputFiles(path.join(TEST_DATA, 'volvox.fasta.gff3'))
  await submitAndWaitForSuccess(page)
  await assertAssemblyLoaded(page, 'volvox')

  // Check change log
  await selectFromApolloMenu(page, ['View Change Log'])
  const textarea = page.locator('textarea')
  await expect(textarea).toHaveCount(1)
  await expect(textarea).toContainText('"AddAssemblyAndFeaturesFromFileChange"')
})

test('Can add assembly from gff3 without importing features', async ({
  page,
}) => {
  await addAssemblyViaMenu(page)
  const form = page.locator('form[data-testid="submit-form"]')
  await fillAssemblyName(page, 'volvox')

  await form.getByText('GFF3 input').click()
  await form
    .locator('input[data-testid="gff3-input-file"]')
    .setInputFiles(path.join(TEST_DATA, 'volvox.fasta.gff3'))

  // Uncheck "Load features from GFF3"
  await form
    .getByText('Load features from GFF3 file')
    .locator('..')
    .locator('input[type="checkbox"]')
    .click()

  await submitAndWaitForSuccess(page)
  await assertAssemblyLoaded(page, 'volvox')

  await selectFromApolloMenu(page, ['View Change Log'])
  const textarea = page.locator('textarea')
  await expect(textarea).toHaveCount(1)
  await expect(textarea).toContainText('"AddAssemblyFromFileChange"')
})

test('Can add assembly from editable gzip fasta', async ({ page }) => {
  await addAssemblyViaMenu(page)
  const form = page.locator('form[data-testid="submit-form"]')
  await fillAssemblyName(page, 'volvox')

  // Check "sequence is editable"
  await form
    .locator('[data-testid="sequence-is-editable-checkbox"]')
    .locator('input[type="checkbox"]')
    .click()

  await form
    .locator('input[data-testid="fasta-input-file"]')
    .setInputFiles(path.join(TEST_DATA, 'volvox.fa.gz'))

  // Index files should be disabled when sequence is editable
  await expect(
    form.locator('input[data-testid="fai-input-file"]'),
  ).toBeDisabled()
  await expect(
    form.locator('input[data-testid="gzi-input-file"]'),
  ).toBeDisabled()

  await submitAndWaitForSuccess(page)
  await assertAssemblyLoaded(page, 'volvox')
})

test('Can add assembly from non-editable fasta', async ({ page }) => {
  await addAssemblyViaMenu(page)
  const form = page.locator('form[data-testid="submit-form"]')
  await fillAssemblyName(page, 'volvox')

  // Submit should be disabled without index files
  await expect(
    form.locator('Button[data-testid="submit-button"]'),
  ).toBeDisabled()

  // Gzip checkbox should be checked and disabled
  const gzipCheckbox = form
    .locator('[data-testid="fasta-is-gzip-checkbox"]')
    .locator('input[type="checkbox"]')
  await expect(gzipCheckbox).toBeChecked()
  await expect(gzipCheckbox).toBeDisabled()

  await form
    .locator('input[data-testid="fasta-input-file"]')
    .setInputFiles(path.join(TEST_DATA, 'volvox.fa.gz'))
  await form
    .locator('input[data-testid="fai-input-file"]')
    .setInputFiles(path.join(TEST_DATA, 'volvox.fa.gz.fai'))
  await form
    .locator('input[data-testid="gzi-input-file"]')
    .setInputFiles(path.join(TEST_DATA, 'volvox.fa.gz.gzi'))

  await submitAndWaitForSuccess(page)
  await assertAssemblyLoaded(page, 'volvox')

  // Verify change log contains index file references
  await selectFromApolloMenu(page, ['View Change Log'])
  const textarea = page.locator('textarea')
  await expect(textarea).toContainText('"gzi":')
  await expect(textarea).toContainText('"fai":')
})

test('Keep original defaults when switching panels', async ({ page }) => {
  await addAssemblyViaMenu(page)
  const form = page.locator('form[data-testid="submit-form"]')
  await fillAssemblyName(page, 'volvox')

  // Select GFF3 first (implicitly enables editable mode)
  await form.getByText('GFF3 input').click()
  await form
    .locator('input[data-testid="gff3-input-file"]')
    .setInputFiles(path.join(TEST_DATA, 'volvox.fasta.gff3'))

  // Switch back to FASTA input
  await form.getByText('FASTA input').click()

  // Indexes should still be required (not disabled)
  await expect(
    form.locator('input[data-testid="fai-input-file"]'),
  ).toBeEnabled()
  await expect(
    form.locator('input[data-testid="gzi-input-file"]'),
  ).toBeEnabled()

  // "sequence is editable" should NOT be checked
  const editableCheckbox = form
    .locator('[data-testid="sequence-is-editable-checkbox"]')
    .locator('input[type="checkbox"]')
  await expect(editableCheckbox).not.toBeChecked()

  // Click editable → indexes should be disabled
  await editableCheckbox.click()
  await expect(
    form.locator('input[data-testid="fai-input-file"]'),
  ).toBeDisabled()
  await expect(
    form.locator('input[data-testid="gzi-input-file"]'),
  ).toBeDisabled()
})

test('Can add assembly from remote url', async ({ page }) => {
  await addAssemblyViaMenu(page)
  const form = page.locator('form[data-testid="submit-form"]')
  await fillAssemblyName(page, 'volvox')

  // Switch to URL mode
  await form
    .locator('[data-testid="files-on-url-checkbox"]')
    .locator('input[type="checkbox"]')
    .click()

  // "sequence is editable" should be disabled in URL mode
  await expect(
    form
      .locator('[data-testid="sequence-is-editable-checkbox"]')
      .locator('input[type="checkbox"]'),
  ).toBeDisabled()

  // Gzip should be checked and disabled
  const gzipCheckbox = form
    .locator('[data-testid="fasta-is-gzip-checkbox"]')
    .locator('input[type="checkbox"]')
  await expect(gzipCheckbox).toBeChecked()
  await expect(gzipCheckbox).toBeDisabled()

  await form
    .locator('[data-testid="fasta-input-url"]')
    .locator('input')
    .fill('http://localhost:3999/jbrowse/test_data/volvox.fa.gz')
  await form.locator('[data-testid="fai-input-url"]').locator('input').clear()
  await form
    .locator('[data-testid="fai-input-url"]')
    .locator('input')
    .fill('http://localhost:3999/jbrowse/test_data/volvox.fa.gz.fai')
  await form.locator('[data-testid="gzi-input-url"]').locator('input').clear()
  await form
    .locator('[data-testid="gzi-input-url"]')
    .locator('input')
    .fill('http://localhost:3999/jbrowse/test_data/volvox.fa.gz.gzi')

  await submitAndWaitForSuccess(page)
  await assertAssemblyLoaded(page, 'volvox')
})
