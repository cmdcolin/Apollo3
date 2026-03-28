import { expect, test } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  addAssemblyFromGff,
  deleteAssemblies,
  loginAsRoot,
  selectAssemblyToView,
} from './helpers.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// volvox.fasta.gff3 has embedded FASTA so the sequence service can serve it
const GFF_PATH = path.resolve(__dirname, '../test_data/volvox.fasta.gff3')
const ASSEMBLY = 'volvox'

test.beforeEach(async ({ page }) => {
  await loginAsRoot(page)
})

test.afterEach(async ({ page }) => {
  await page.goto('about:blank')
  await deleteAssemblies()
})

test('Tiberius: gene prediction creates and shows a GTF track', async ({
  page,
}) => {
  await addAssemblyFromGff(page, ASSEMBLY, GFF_PATH)
  await selectAssemblyToView(page, ASSEMBLY, 'ctgA:1..500')

  // Wait for the LinearGenomeView to finish rendering
  await expect(page.locator('button[data-testid="zoom_out"]')).toBeVisible({
    timeout: 15_000,
  })

  // Trigger rubber-band selection by dragging across the main ruler area.
  // [data-testid="rubberband_controls"] appears twice — once for the
  // chromosome overview, once for the main ruler. The last() is the main one
  // whose mouseDown handler fires rubberBandMenuItems().
  const rubberbandControls = page
    .locator('[data-testid="rubberband_controls"]')
    .last()
  await expect(rubberbandControls).toBeVisible({ timeout: 10_000 })
  const bbox = await rubberbandControls.boundingBox()
  if (!bbox) {
    throw new Error('Could not find rubberband_controls bounding box')
  }

  const y = bbox.y + 10
  await page.mouse.move(bbox.x + 50, y)
  await page.mouse.down()
  await page.mouse.move(bbox.x + 200, y, { steps: 10 })
  await page.mouse.up()

  // The rubber-band context menu should appear with the Tiberius option
  await expect(page.getByText('Run Tiberius gene prediction')).toBeVisible({
    timeout: 5_000,
  })
  await page.getByText('Run Tiberius gene prediction').click()

  // RunTiberius dialog opens
  await expect(
    page.getByRole('heading', { name: 'Run Tiberius Gene Prediction' }),
  ).toBeVisible({ timeout: 5_000 })

  // TIBERIUS_MODEL_CFG=human pre-fills the model field, enabling the Run button
  const runButton = page.getByRole('button', { name: 'Run' })
  await expect(runButton).toBeEnabled({ timeout: 5_000 })
  await runButton.click()

  // Wait for the mock tiberius.py to complete and the job to reach 'ready'.
  // The worker polls every 5s; the frontend polls every 3s — allow up to 30s.
  await expect(page.getByText('Gene prediction complete')).toBeVisible({
    timeout: 30_000,
  })

  // Click Show Track — this calls session.addTrackConf + view.showTrack
  await page.getByRole('button', { name: 'Show Track' }).click()

  // The dialog closes and the Tiberius FeatureTrack label should appear
  await expect(page.getByText(/^Tiberius:/, { exact: false })).toBeVisible({
    timeout: 10_000,
  })
})
