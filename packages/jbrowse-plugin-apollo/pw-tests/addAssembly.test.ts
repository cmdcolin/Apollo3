import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  deleteAssemblies,
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
  await expect(page.getByText('Select assembly to view')).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByText(assemblyName)).toBeVisible({ timeout: 10_000 })
}

async function goToAddAssemblyPage(page: import('@playwright/test').Page) {
  await page.goto('/admin/add-assembly/')
  await expect(page.getByRole('heading', { name: 'Add Assembly' })).toBeVisible(
    { timeout: 10_000 },
  )
}

test('Can add assembly from fasta file path', async ({ page }) => {
  await goToAddAssemblyPage(page)
  await page.getByLabel('Assembly name').fill('volvox')
  await page
    .getByLabel('FASTA file path (server-accessible)')
    .fill(path.join(TEST_DATA, 'volvox.fa'))
  await page
    .getByLabel('FAI index path (defaults to FASTA + .fai)')
    .fill(path.join(TEST_DATA, 'volvox.fa.fai'))
  await page.getByRole('button', { name: 'Create Assembly' }).click()
  await expect(page.getByText('Assembly "volvox" created.')).toBeVisible({
    timeout: 30_000,
  })
  await page.goto('/jbrowse/')
  await assertAssemblyLoaded(page, 'volvox')
})

test('Can add assembly from 2bit file path', async ({ page }) => {
  await goToAddAssemblyPage(page)
  await page.getByLabel('Assembly name').fill('volvox')
  await page.getByLabel('Sequence source type').click()
  await page.getByRole('option', { name: '2bit' }).click()
  await page
    .getByLabel('2bit file path (server-accessible)')
    .fill(path.join(TEST_DATA, 'volvox.2bit'))
  await page.getByRole('button', { name: 'Create Assembly' }).click()
  await expect(page.getByText('Assembly "volvox" created.')).toBeVisible({
    timeout: 30_000,
  })
  await page.goto('/jbrowse/')
  await assertAssemblyLoaded(page, 'volvox')
})

test('Can add assembly from gzip fasta path', async ({ page }) => {
  await goToAddAssemblyPage(page)
  await page.getByLabel('Assembly name').fill('volvox')
  await page
    .getByLabel('FASTA file path (server-accessible)')
    .fill(path.join(TEST_DATA, 'volvox.fa.gz'))
  await page
    .getByLabel('FAI index path (defaults to FASTA + .fai)')
    .fill(path.join(TEST_DATA, 'volvox.fa.gz.fai'))
  await page
    .getByLabel('GZI index path (for bgzip-compressed FASTA)')
    .fill(path.join(TEST_DATA, 'volvox.fa.gz.gzi'))
  await page.getByRole('button', { name: 'Create Assembly' }).click()
  await expect(page.getByText('Assembly "volvox" created.')).toBeVisible({
    timeout: 30_000,
  })
  await page.goto('/jbrowse/')
  await assertAssemblyLoaded(page, 'volvox')
})

test('Shows error when assembly name is missing', async ({ page }) => {
  await goToAddAssemblyPage(page)
  await page
    .getByLabel('FASTA file path (server-accessible)')
    .fill(path.join(TEST_DATA, 'volvox.fa'))
  await page.getByRole('button', { name: 'Create Assembly' }).click()
  await expect(page.getByText('Assembly name is required')).toBeVisible()
})

test('Change log records assembly creation with index files', async ({
  page,
}) => {
  await goToAddAssemblyPage(page)
  await page.getByLabel('Assembly name').fill('volvox')
  await page
    .getByLabel('FASTA file path (server-accessible)')
    .fill(path.join(TEST_DATA, 'volvox.fa.gz'))
  await page
    .getByLabel('FAI index path (defaults to FASTA + .fai)')
    .fill(path.join(TEST_DATA, 'volvox.fa.gz.fai'))
  await page
    .getByLabel('GZI index path (for bgzip-compressed FASTA)')
    .fill(path.join(TEST_DATA, 'volvox.fa.gz.gzi'))
  await page.getByRole('button', { name: 'Create Assembly' }).click()
  await expect(page.getByText('Assembly "volvox" created.')).toBeVisible({
    timeout: 30_000,
  })
  await page.goto('/jbrowse/')
  await expect(page.getByRole('button', { name: 'Apollo' })).toBeEnabled({
    timeout: 15_000,
  })
  await selectFromApolloMenu(page, ['View', 'Change log'])
  const textarea = page.locator('textarea')
  await expect(textarea).toContainText('"gzi":')
  await expect(textarea).toContainText('"fai":')
})

test('Source type switch resets file path', async ({ page }) => {
  await goToAddAssemblyPage(page)
  await page.getByLabel('Assembly name').fill('volvox')
  await page
    .getByLabel('FASTA file path (server-accessible)')
    .fill(path.join(TEST_DATA, 'volvox.fa'))

  // Switch to 2bit — FASTA field should disappear
  await page.getByLabel('Sequence source type').click()
  await page.getByRole('option', { name: '2bit' }).click()
  await expect(
    page.getByLabel('FASTA file path (server-accessible)'),
  ).not.toBeVisible()
  await expect(
    page.getByLabel('2bit file path (server-accessible)'),
  ).toBeVisible()

  // Switch back to FASTA — 2bit field should disappear
  await page.getByLabel('Sequence source type').click()
  await page.getByRole('option', { name: 'FASTA' }).click()
  await expect(
    page.getByLabel('FASTA file path (server-accessible)'),
  ).toBeVisible()
  await expect(
    page.getByLabel('2bit file path (server-accessible)'),
  ).not.toBeVisible()
})
