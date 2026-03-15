import { readFileSync } from 'node:fs'

import { type Page, expect } from '@playwright/test'

const API_BASE = 'http://127.0.0.1:3999'

// ── API helpers (run in Node.js, not the browser) ───────────────────

export async function getGuestToken() {
  console.log('[api] Fetching guest token...')
  const res = await fetch(`${API_BASE}/auth/guest`)
  const data = (await res.json()) as { token: string }
  console.log('[api] Got guest token')
  return data.token
}

export async function uploadFileViaApi(filePath: string, fileType: string) {
  const token = await getGuestToken()
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

export async function addAssemblyViaApi(
  assemblyName: string,
  fileId: string,
) {
  const token = await getGuestToken()
  const assemblyId = [...Array(24)]
    .map(() => Math.floor(Math.random() * 16).toString(16))
    .join('')

  console.log(
    `[api] Creating assembly "${assemblyName}" (id=${assemblyId})...`,
  )
  const res = await fetch(`${API_BASE}/changes`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      typeName: 'AddAssemblyAndFeaturesFromFileChange',
      assembly: assemblyId,
      assemblyName,
      sequenceSource: { type: 'chunked', fa: fileId },
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Add assembly failed: ${res.status} ${body}`)
  }
  console.log(`[api] Assembly created: ${assemblyName}`)
  return assemblyId
}

export async function deleteAssemblies() {
  console.log('[cleanup] Deleting all assemblies...')
  const token = await getGuestToken()
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
  const res = await fetch(`${API_BASE}/assemblies`, { headers })
  const assemblies = (await res.json()) as { _id: string }[]
  for (const assembly of assemblies) {
    const delRes = await fetch(`${API_BASE}/changes`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        typeName: 'DeleteAssemblyChange',
        assembly: assembly._id,
      }),
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
    // Retry once
    for (const assembly of remaining) {
      await fetch(`${API_BASE}/changes`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          typeName: 'DeleteAssemblyChange',
          assembly: assembly._id,
        }),
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

export async function loginAsGuest(page: Page) {
  setupBrowserLogging(page)

  // Get a guest token via API and set it as a cookie on the browser context.
  // This authenticates the browser before JBrowse loads — no login dialog.
  const token = await getGuestToken()
  await page.context().addCookies([
    {
      name: 'apollo-token',
      value: token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ])

  // Also set the InternetAccount sessionStorage token so the plugin connects
  // its websocket. The key format is "${internetAccountId}-token".
  // The internetAccountId comes from the server config: "${NAME}-apolloInternetAccount"
  const internetAccountId = 'Demo Server-apolloInternetAccount'
  await page.goto('/')
  await page.evaluate(
    ([id, t]) => {
      sessionStorage.setItem(`${id}-token`, t)
    },
    [internetAccountId, token],
  )

  // Reload so JBrowse initializes with both the cookie and the sessionStorage token
  console.log('[login] Navigating with auth cookie + sessionStorage token...')
  await page.goto('/')

  await expect(
    page.getByRole('button', { name: 'Apollo' }),
  ).toBeEnabled({ timeout: 20_000 })
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
  await expect(
    page.getByRole('button', { name: 'Apollo' }),
  ).toBeEnabled({ timeout: 15_000 })
  await dismissDialogs(page)

  const lastItem = path.at(-1)!
  const prefixItems = path.slice(0, -1)
  const firstItem = prefixItems[0] ?? lastItem

  await page.getByRole('button', { name: 'Apollo' }).click()

  await expect(
    page.locator('[role="menuitem"]').filter({ hasText: firstItem }),
  ).toBeVisible({ timeout: 15_000 })

  for (const item of prefixItems) {
    await page
      .locator('[role="menuitem"]')
      .filter({ hasText: item })
      .hover()
  }

  await page
    .locator('[role="menuitem"]')
    .getByText(lastItem, { exact: true })
    .click()
}

export async function addAssemblyFromGff(
  page: Page,
  assemblyName: string,
  gffPath: string,
  launch = true,
) {
  console.log(`[addAssembly] Starting for "${assemblyName}"...`)
  const file = await uploadFileViaApi(gffPath, 'text/x-gff3')
  await addAssemblyViaApi(assemblyName, file._id)

  // Reload to pick up the new assembly in config.json
  console.log('[addAssembly] Reloading to pick up new assembly...')
  await page.goto('/')

  await expect(
    page.getByRole('button', { name: 'Apollo' }),
  ).toBeEnabled({ timeout: 15_000 })

  // Verify the session token is present for data fetching
  const hasToken = await page.evaluate((id) => {
    const key = `${id}-token`
    const token = sessionStorage.getItem(key)
    console.log(`[sessionStorage] key="${key}" present=${!!token}`)
    return !!token
  }, 'Demo Server-apolloInternetAccount')
  if (!hasToken) {
    console.log('[addAssembly] WARNING: sessionStorage token missing, re-injecting')
    const token = await getGuestToken()
    await page.evaluate(
      ([id, t]) => {
        sessionStorage.setItem(`${id}-token`, t)
      },
      ['Demo Server-apolloInternetAccount', token],
    )
    await page.goto('/')
    await expect(
      page.getByRole('button', { name: 'Apollo' }),
    ).toBeEnabled({ timeout: 15_000 })
  }
  console.log('[addAssembly] App ready')

  if (launch) {
    // The authenticated config includes a defaultSession with a LinearGenomeView,
    // so a view may already be open. Click "Launch view" only if present.
    const launchButton = page.getByRole('button', { name: 'Launch view' })
    if (await launchButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
      console.log('[addAssembly] Clicking Launch view...')
      await launchButton.click()
    }
    await expect(
      page.getByText('Select assembly to view'),
    ).toBeVisible({ timeout: 15_000 })
    console.log('[addAssembly] View ready')
  }
}

export async function selectAssemblyToView(
  page: Page,
  assemblyName: string,
  location: string,
) {
  console.log(`[nav] Selecting assembly "${assemblyName}" at ${location}`)
  await expect(page.getByText('Select assembly to view')).toBeVisible({
    timeout: 10_000,
  })

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
  await page.waitForTimeout(1000)
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
    await page.waitForResponse(
      (resp) =>
        resp.url().includes('/users/userLocation') && resp.status() === 200,
    )
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

export async function downloadGff(page: Page, assemblyName: string, includeFasta: boolean) {
  await selectFromApolloMenu(page, ['Download GFF3'])

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

export async function annotationTrackAppearance(
  page: Page,
  option: string,
) {
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
