import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'

import { gff3LineToSnapshot } from '@apollo-annotation/shared'
import { parseStringSync } from '@gmod/gff'
import { type Page, expect } from '@playwright/test'

const API_BASE = 'http://127.0.0.1:3999'

// ── API helpers (run in Node.js, not the browser) ───────────────────

export async function getRootToken() {
  console.log('[api] Fetching root token...')
  const res = await fetch(`${API_BASE}/auth/root`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'password' }),
  })
  const data = (await res.json()) as { token: string }
  console.log('[api] Got root token')
  return data.token
}

export async function uploadFileViaApi(filePath: string, fileType: string) {
  const token = await getRootToken()
  const fileContent = readFileSync(filePath)
  const fileName = filePath.split('/').pop()!
  console.log(`[api] Uploading ${fileName} (${fileContent.length} bytes)...`)

  const formData = new FormData()
  formData.append('file', new Blob([fileContent]), fileName)
  formData.append('type', fileType)

  const res = await fetch(
    `${API_BASE}/files?type=${encodeURIComponent(fileType)}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    },
  )
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Upload failed: ${res.status} ${body}`)
  }
  const data = (await res.json()) as { _id: string; checksum: string }
  console.log(`[api] Upload OK: id=${data._id} checksum=${data.checksum}`)
  return data
}

export async function deleteAssemblies() {
  console.log('[cleanup] Deleting all assemblies...')
  const token = await getRootToken()
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
  const res = await fetch(`${API_BASE}/assemblies`, { headers })
  const assemblies = (await res.json()) as { _id: string }[]
  for (const assembly of assemblies) {
    const delRes = await fetch(`${API_BASE}/assemblies/${assembly._id}`, {
      method: 'DELETE',
      headers,
    })
    if (!delRes.ok) {
      console.log(
        `[cleanup] WARNING: Failed to delete assembly ${assembly._id}: ${delRes.status}`,
      )
    }
  }
  // Verify cleanup completed
  const verifyRes = await fetch(`${API_BASE}/assemblies`, { headers })
  const remaining = (await verifyRes.json()) as { _id: string }[]
  if (remaining.length > 0) {
    console.log(
      `[cleanup] WARNING: ${remaining.length} assemblies still remain after cleanup`,
    )
    for (const assembly of remaining) {
      await fetch(`${API_BASE}/assemblies/${assembly._id}`, {
        method: 'DELETE',
        headers,
      })
    }
  }
  console.log(`[cleanup] Deleted ${assemblies.length} assemblies`)
}

// ── Browser helpers ─────────────────────────────────────────────────

export function setupBrowserLogging(page: Page) {
  page.on('console', (msg) => {
    const type = msg.type()
    const text = msg.text()
    if (type === 'error' || type === 'warning') {
      console.log(`[browser ${type}] ${text}`)
    }
  })
  page.on('pageerror', (err) => {
    console.log(`[browser exception] ${err.message}`)
  })
  page.on('requestfailed', (req) => {
    if (!req.url().includes('google-analytics')) {
      console.log(
        `[network FAILED] ${req.method()} ${req.url()} ${req.failure()?.errorText}`,
      )
    }
  })
}

export async function loginAsRoot(page: Page) {
  setupBrowserLogging(page)
  await page.goto('/jbrowse/')
  const passwordField = page.getByLabel('Root password')
  await expect(passwordField).toBeVisible({ timeout: 15_000 })
  await passwordField.fill('password')
  await page.getByRole('button', { name: 'Sign in as Root' }).click()
  await expect(page.getByRole('button', { name: 'Apollo' })).toBeEnabled({
    timeout: 30_000,
  })
  console.log('[login] Apollo button ready')
}

export async function dismissDialogs(page: Page) {
  const dialog = page.locator('.MuiDialog-root')
  if (await dialog.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible({ timeout: 5_000 })
  }
}

// ── Navigation helpers ──────────────────────────────────────────────

export async function selectFromApolloMenu(page: Page, path: string[]) {
  await expect(page.getByRole('button', { name: 'Apollo' })).toBeEnabled({
    timeout: 15_000,
  })
  await dismissDialogs(page)

  const lastItem = path.at(-1)!
  const prefixItems = path.slice(0, -1)
  const firstItem = prefixItems[0] ?? lastItem

  await page.getByRole('button', { name: 'Apollo' }).click()

  await expect(
    page.locator('[role="menuitem"]').filter({ hasText: firstItem }),
  ).toBeVisible({ timeout: 15_000 })

  for (const item of prefixItems) {
    await page.locator('[role="menuitem"]').filter({ hasText: item }).hover()
  }

  await page
    .locator('[role="menuitem"]')
    .getByText(lastItem, { exact: true })
    .click()
}

export async function addAssemblyViaApi(
  assemblyName: string,
  gffPath: string,
): Promise<string> {
  const token = await getRootToken()
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
  const faPath = gffPath.replace(/\.gff3(\.gz)?$/, '.fa')
  const faiPath = `${faPath}.fai`
  const res = await fetch(`${API_BASE}/assemblies`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: assemblyName,
      sequenceSource: { type: 'fasta', fa: faPath, fai: faiPath },
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`POST /assemblies failed: ${res.status} ${body}`)
  }
  const assembly = (await res.json()) as { _id: string }
  return assembly._id
}

export async function addAssemblyFromGff(
  page: Page,
  assemblyName: string,
  gffPath: string,
  launch = true,
): Promise<void> {
  const token = await getRootToken()
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }

  const assemblyId = await addAssemblyViaApi(assemblyName, gffPath)

  const refSeqsRes = await fetch(
    `${API_BASE}/refSeqs?assembly=${encodeURIComponent(assemblyName)}`,
    { headers },
  )
  const refSeqs = (await refSeqsRes.json()) as { _id: string; name: string }[]
  console.log(
    `[api] Assembly ${assemblyName}: ${refSeqs.length} refSeqs found`,
  )
  const refSeqIdMap = new Map(refSeqs.map((rs) => [rs.name, rs._id]))

  const gff3Text = gffPath.endsWith('.gz')
    ? gunzipSync(readFileSync(gffPath)).toString('utf8')
    : readFileSync(gffPath, 'utf8')
  const features = parseStringSync(gff3Text, { parseSequences: false })
  let featCount = 0

  for (const featureGroup of features) {
    if (!Array.isArray(featureGroup) || featureGroup.length === 0) {
      continue
    }
    const line = featureGroup[0]
    if (!line.seq_id || !line.type) {
      continue
    }
    const refSeqId = refSeqIdMap.get(line.seq_id)
    if (!refSeqId) {
      continue
    }
    const snapshot = gff3LineToSnapshot(line, refSeqId)
    const featRes = await fetch(`${API_BASE}/features`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        addedFeature: snapshot,
        assemblyId,
      }),
    })
    if (!featRes.ok) {
      const body = await featRes.text()
      console.log(
        `[api] WARNING: Feature POST failed: ${featRes.status} ${body}`,
      )
    }
    featCount++
  }
  console.log(`[api] Posted ${featCount} features for ${assemblyName}`)

  await page.reload()
  await expect(page.getByRole('button', { name: 'Apollo' })).toBeEnabled({
    timeout: 20_000,
  })
  if (launch) {
    const launchButton = page.getByRole('button', { name: 'Launch view' })
    if (await launchButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await launchButton.click()
    }
  }
}

export async function selectAssemblyToView(
  page: Page,
  assemblyName: string,
  location: string,
) {
  console.log(`[nav] Selecting assembly "${assemblyName}" at ${location}`)

  // The page may be at "Select a view to launch" (needs Launch view click)
  // or already at "Select assembly to view" (LGV is open)
  const selectAssembly = page.getByText('Select assembly to view')
  const launchButton = page.getByText('Launch view', { exact: false })
  const result = await Promise.race([
    selectAssembly.waitFor({ timeout: 15_000 }).then(() => 'assembly' as const),
    launchButton.waitFor({ timeout: 15_000 }).then(() => 'launch' as const),
  ])
  if (result === 'launch') {
    console.log('[nav] Clicking Launch view')
    await launchButton.click()
    await expect(selectAssembly).toBeVisible({ timeout: 10_000 })
  }

  const assemblyContainer = page
    .getByText('Select assembly to view')
    .locator('..')
  const assemblyText = await assemblyContainer.textContent()
  if (!assemblyText?.includes(assemblyName)) {
    console.log(`[nav] Switching assembly to "${assemblyName}"`)
    await assemblyContainer.locator('[role="combobox"]').click()
    await page.locator('li').filter({ hasText: assemblyName }).click()
  }

  const locationInput = page
    .getByText('Enter sequence name, feature name, or location')
    .locator('..')
    .locator('input')
  await locationInput.fill(location)
  await locationInput.press('Enter')
  console.log(`[nav] Navigated to ${location}`)
  await page.waitForLoadState('networkidle', { timeout: 3_000 }).catch(() => {})
}

export async function searchFeatures(
  page: Page,
  query: string,
  expectedNumOfHits: number,
) {
  const locationInput = page.getByPlaceholder('Search for location')
  await locationInput.fill(query)
  await locationInput.press('Enter')

  if (expectedNumOfHits === 0) {
    await expect(
      page.getByText(`Error: Unknown feature or sequence "${query}"`),
    ).toBeVisible({ timeout: 10_000 })
  } else if (expectedNumOfHits === 1) {
    // Single hit navigates directly - wait for the location bar to update
    await expect(locationInput).not.toHaveValue(query, { timeout: 10_000 })
  } else {
    const searchResults = page.getByText('Search results').locator('..')
    await expect(searchResults).toBeVisible({ timeout: 10_000 })
    const rows = searchResults.locator('tbody tr')
    await expect(rows).toHaveCount(expectedNumOfHits, { timeout: 10_000 })
  }
}

export async function currentLocationEquals(
  page: Page,
  contig: string,
  start: number,
  end: number,
  tolerance: number,
) {
  const locationInput = page.getByPlaceholder('Search for location')
  const currentLocation = await locationInput.inputValue()
  const [xcontig, s, e] = currentLocation.split(/:|\.\./)
  const xstart = Number.parseInt(s.replace(',', ''), 10)
  const xend = Number.parseInt(e.replace(',', ''), 10)
  expect(xcontig).toBe(contig)
  expect(xstart).toBeGreaterThanOrEqual(start - tolerance)
  expect(xstart).toBeLessThanOrEqual(start + tolerance)
  expect(xend).toBeGreaterThanOrEqual(end - tolerance)
  expect(xend).toBeLessThanOrEqual(end + tolerance)
}

export async function downloadGff(
  page: Page,
  assemblyName: string,
  includeFasta: boolean,
) {
  await selectFromApolloMenu(page, ['View', 'Download GFF3'])

  const selectAssembly = page.getByText('Select assembly').locator('..')
  await selectAssembly.locator('input').first().click()
  await page.locator('li').filter({ hasText: assemblyName }).click()

  if (includeFasta) {
    await page
      .locator('[data-testid="include-fasta-checkbox"]')
      .locator('input')
      .click()
  }

  const downloadPromise = page.waitForResponse(
    (resp) => resp.url().includes('/export?exportID=') && resp.status() === 200,
  )
  await page.getByRole('button', { name: 'Download' }).click()
  const response = await downloadPromise
  return await response.text()
}

export async function refreshTableEditor(page: Page) {
  const trackMenu = page.locator('[data-testid="track_menu_icon"]').first()
  await trackMenu.click()
  await page.getByText('Show graphical display').click()
  await trackMenu.click()
  await page.getByText('Show both graphical and table display').click()
}

export async function annotationTrackAppearance(page: Page, option: string) {
  console.log(`[track] Setting display: "${option}"`)
  await page.getByText('Open track selector', { exact: false }).click()
  // Track selector needs time to load available tracks
  const annotationTrack = page.getByText('Annotations (', { exact: false })
  await expect(annotationTrack).toBeVisible({ timeout: 15_000 })
  await annotationTrack.click()
  await page.getByRole('button', { name: 'Minimize drawer' }).click()

  const trackMenu = page.locator('[data-testid="track_menu_icon"]').first()
  await trackMenu.click()

  // The display option may be under "Appearance" or "Display types" submenu
  const appearanceMenu = page
    .locator('[role="menuitem"]')
    .filter({ hasText: 'Appearance' })
  if (await appearanceMenu.isVisible().catch(() => false)) {
    await appearanceMenu.hover()
    const optionEl = page.getByText(option)
    if (await optionEl.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await optionEl.click()
      console.log(`[track] Display set via Appearance: "${option}"`)
      return
    }
  }

  // Fallback: try Display types submenu
  await page
    .locator('[role="menuitem"]')
    .filter({ hasText: 'Display types' })
    .hover()
  await page.getByText(option).click()
  console.log(`[track] Display set via Display types: "${option}"`)
}
