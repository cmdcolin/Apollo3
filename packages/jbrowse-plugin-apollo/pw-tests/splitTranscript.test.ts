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
// mergeTranscripts.gff3 has mrna03 with 3 exons — ideal for split testing
const GFF_PATH = path.resolve(__dirname, '../test_data/mergeTranscripts.gff3')
const ASSEMBLY = 'mergeTranscripts.gff3'

test.beforeEach(async ({ page }) => {
  await resetDatabase()
  await loginAsRoot(page)
})

test.afterEach(async ({ page }) => {
  await page.goto('about:blank')
})

test('Split transcript at first exon boundary', async ({ page }) => {
  await addAssemblyFromGff(page, ASSEMBLY, GFF_PATH)
  await selectAssemblyToView(page, ASSEMBLY, 'chr2:1..60')
  await annotationTrackAppearance(page, 'Show both graphical and table display')

  // mrna03 should be visible before split
  await expect(page.getByText('Id=mrna03,')).toBeVisible({ timeout: 10_000 })

  // Right-click mrna03 to open context menu
  await page.getByText('Id=mrna03,').click({ button: 'right', force: true })
  await page.getByText('Split transcript').click({ timeout: 10_000 })

  // Dialog should appear
  const dialog = page.locator('[data-testid="split-transcript"]')
  await expect(dialog).toBeVisible({ timeout: 5_000 })
  await expect(dialog.getByText('Split transcript at:')).toBeVisible()

  // Two split points should be listed (3 exons → 2 boundaries)
  const radioButtons = dialog.locator('input[type="radio"]')
  await expect(radioButtons).toHaveCount(2)

  // The first split point: between exon 1 and exon 2
  // exon3 (min=5,max=14) → display "6..14"; exon4 (min=18,max=21) → display "19..21"
  await expect(
    dialog.getByText('Between exon 1 (6..14) and exon 2 (19..21)'),
  ).toBeVisible()

  // Select the first split point (should be pre-selected, but click to confirm)
  await radioButtons.first().click()
  await dialog.getByRole('button', { name: 'Submit' }).click()

  // Wait for the change to be applied
  await page.waitForResponse(
    (resp) => resp.url().includes('/features') && resp.status() === 201,
  )

  // mrna03 should be gone after split
  await expect(page.getByText('Id=mrna03,')).not.toBeVisible({
    timeout: 10_000,
  })

  // Two new transcripts should appear (their IDs are generated, so verify by count)
  // gene02 should now have mrna02, mrna04, mrna05, mrna06, and the 2 new split transcripts
  const tbody = page.locator('tbody')
  await expect(tbody).toBeVisible()

  // The gene should still exist and have children
  await expect(page.getByText('Id=gene02,')).toBeVisible()
})

test('Split transcript shows error when fewer than 2 exons', async ({
  page,
}) => {
  // onegene.fasta.gff3 has tx1 with only 1 CDS child and no exon children
  // Use mergeTranscripts.gff3 but look for mrna05 which has 1 exon
  await addAssemblyFromGff(page, ASSEMBLY, GFF_PATH)
  await selectAssemblyToView(page, ASSEMBLY, 'chr2:1..60')
  await annotationTrackAppearance(page, 'Show both graphical and table display')

  // mrna06 has only 1 exon — split should show "cannot be split" message
  await expect(page.getByText('Id=mrna06,')).toBeVisible({ timeout: 10_000 })
  await page.getByText('Id=mrna06,').click({ button: 'right', force: true })
  await page.getByText('Split transcript').click({ timeout: 10_000 })

  const dialog = page.locator('[data-testid="split-transcript"]')
  await expect(dialog).toBeVisible({ timeout: 5_000 })
  await expect(
    dialog.getByText(
      'This transcript has fewer than 2 exons and cannot be split.',
    ),
  ).toBeVisible()

  // Submit button should be disabled
  await expect(dialog.getByRole('button', { name: 'Submit' })).toBeDisabled()

  await dialog.getByRole('button', { name: 'Cancel' }).click()
})

test('Split and undo restores original transcript', async ({ page }) => {
  await addAssemblyFromGff(page, ASSEMBLY, GFF_PATH)
  await selectAssemblyToView(page, ASSEMBLY, 'chr2:1..60')
  await annotationTrackAppearance(page, 'Show both graphical and table display')

  await expect(page.getByText('Id=mrna03,')).toBeVisible({ timeout: 10_000 })

  // Split mrna03
  await page.getByText('Id=mrna03,').click({ button: 'right', force: true })
  await page.getByText('Split transcript').click({ timeout: 10_000 })

  const dialog = page.locator('[data-testid="split-transcript"]')
  await expect(dialog).toBeVisible({ timeout: 5_000 })
  await page.getByRole('button', { name: 'Submit' }).click()
  await page.waitForResponse(
    (resp) => resp.url().includes('/features') && resp.status() === 201,
  )

  // mrna03 should be gone
  await expect(page.getByText('Id=mrna03,')).not.toBeVisible({
    timeout: 10_000,
  })

  // Undo the split — Apollo menu → Undo
  await page.getByRole('button', { name: 'Apollo' }).click()
  await expect(
    page.locator('[role="menuitem"]').filter({ hasText: 'Undo' }),
  ).toBeVisible({ timeout: 10_000 })
  await page
    .locator('[role="menuitem"]')
    .getByText('Undo', { exact: true })
    .click()

  await page.waitForResponse(
    (resp) => resp.url().includes('/features') && resp.status() === 201,
  )

  // mrna03 should be restored
  await expect(page.getByText('Id=mrna03,')).toBeVisible({ timeout: 15_000 })
})
