import { readFileSync } from 'node:fs'

import { type Page, expect } from '@playwright/test'

const API_BASE = 'http://127.0.0.1:3999'
const CONFIG_URL = `${API_BASE}/jbrowse/config.json`
const APP_URL = `/?config=${CONFIG_URL}`

const defaultHeaders = { Connection: 'close' }

export async function getGuestToken() {
  const res = await fetch(`${API_BASE}/auth/guest`, { headers: defaultHeaders })
  const data = (await res.json()) as { token: string }
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

  const res = await fetch(`${API_BASE}/files?type=${encodeURIComponent(fileType)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Connection: 'close' },
    body: formData,
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Upload failed: ${res.status} ${body}`)
  }
  const data = (await res.json()) as { _id: string; checksum: string }
  console.log(`[api] Upload OK: id=${data._id} checksum=${data.checksum}`)
  return data
}

export async function addAssemblyViaApi(assemblyName: string, fileId: string) {
  const token = await getGuestToken()
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
  const assemblyId = [...Array(24)]
    .map(() => Math.floor(Math.random() * 16).toString(16))
    .join('')

  console.log(`[api] Creating assembly "${assemblyName}" (id=${assemblyId}, fileId=${fileId})...`)
  const res = await fetch(`${API_BASE}/changes`, {
    method: 'POST',
    headers: { ...headers, Connection: 'close' },
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

export function setupBrowserLogging(page: Page) {
  page.on('console', (msg) => {
    const type = msg.type()
    const text = msg.text()
    if (type === 'error') {
      console.log(`[browser error] ${text}`)
    } else if (type === 'warning') {
      console.log(`[browser warn] ${text}`)
    } else {
      console.log(`[browser ${type}] ${text}`)
    }
  })
  page.on('pageerror', (err) => {
    console.log(`[browser exception] ${err.message}`)
  })
  page.on('requestfailed', (req) => {
    console.log(`[network FAILED] ${req.method()} ${req.url()} ${req.failure()?.errorText}`)
  })
}

async function waitForAppReady(page: Page) {
  const apolloButton = page.getByRole('button', { name: 'Apollo' })
  const guestLoginText = page.getByText('Continue as Guest')
  const trustButton = page.getByRole('button', { name: 'Yes, I trust it' })

  // JBrowse may show a plugin trust warning dialog, a login dialog, or go
  // straight to the main UI. Race all three possibilities.
  await Promise.race([
    apolloButton.waitFor({ timeout: 20_000 }),
    guestLoginText.waitFor({ timeout: 20_000 }),
    trustButton.waitFor({ timeout: 20_000 }),
  ])

  // Dismiss plugin trust dialog if present
  if (await trustButton.isVisible().catch(() => false)) {
    console.log('[login] Dismissing plugin trust dialog')
    await trustButton.click()
    await Promise.race([
      apolloButton.waitFor({ timeout: 15_000 }),
      guestLoginText.waitFor({ timeout: 15_000 }),
    ])
  }
}

export async function loginAsGuest(page: Page) {
  setupBrowserLogging(page)

  await page.goto(APP_URL)
  await waitForAppReady(page)

  // If login dialog is showing, click "Continue as Guest" and reload
  const guestButton = page.getByText('Continue as Guest')
  if (await guestButton.isVisible().catch(() => false)) {
    console.log('[login] Clicking "Continue as Guest"')
    await guestButton.click()
    await expect(page.locator('.MuiDialog-root')).not.toBeVisible({
      timeout: 10_000,
    })
    // Reload and handle trust dialog again (JBrowse may re-prompt after reload)
    await page.reload()
    await waitForAppReady(page)
  }

  // Wait for Apollo menu to be ready
  await expect(
    page.getByRole('button', { name: 'Apollo' }),
  ).toBeEnabled({ timeout: 15_000 })

  // Verify admin role
  const tokenInfo = await page.evaluate(() => {
    const keys = Object.keys(window.sessionStorage)
    const tokenKey = keys.find(
      (k) => k.includes('token') || k.includes('Internet'),
    )
    if (tokenKey) {
      const token = window.sessionStorage.getItem(tokenKey)
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]))
        return { role: payload.role, email: payload.email }
      }
    }
    return null
  })
  console.log(`[login] role=${tokenInfo?.role} email=${tokenInfo?.email}`)

  // Dismiss any dialogs
  const dialog = page.locator('.MuiDialog-root')
  if (await dialog.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
  }
}

export async function deleteAssemblies() {
  console.log('[cleanup] Starting deleteAssemblies...')
  const token = await getGuestToken()
  console.log('[cleanup] Got token')
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
  const res = await fetch(`${API_BASE}/assemblies`, {
    headers: { ...headers, Connection: 'close' },
  })
  const assemblies = (await res.json()) as { _id: string }[]
  console.log(`[cleanup] Found ${assemblies.length} assemblies to delete`)
  for (const assembly of assemblies) {
    console.log(`[cleanup] Deleting assembly ${assembly._id}...`)
    const deleteRes = await fetch(`${API_BASE}/changes`, {
      method: 'POST',
      headers: { ...headers, Connection: 'close' },
      body: JSON.stringify({
        typeName: 'DeleteAssemblyChange',
        assembly: assembly._id,
      }),
    })
    console.log(`[cleanup] Delete response: ${deleteRes.status}`)
  }
  console.log('[cleanup] deleteAssemblies complete')
}

export async function selectFromApolloMenu(page: Page, path: string[]) {
  const menuButton = page.getByRole('button', { name: 'Apollo' })
  await expect(menuButton).toBeEnabled({ timeout: 15_000 })

  // Dismiss any dialogs that may cover the menu
  const dialog = page.locator('.MuiDialog-root')
  if (await dialog.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
  }

  const lastItem = path.at(-1)!
  const prefixItems = path.slice(0, -1)
  const firstItem = prefixItems[0] ?? lastItem

  await menuButton.click()

  // Admin menu items load asynchronously after websocket connects
  await expect(
    page.locator('[role="menuitem"]').filter({ hasText: firstItem }),
  ).toBeVisible({ timeout: 15_000 })

  // Hover over submenu items
  for (const item of prefixItems) {
    await page
      .locator('[role="menuitem"]')
      .filter({ hasText: item })
      .hover()
  }

  // Click the target
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
  // Upload file and create assembly via API (bypasses JBrowse fetcher hang)
  const file = await uploadFileViaApi(gffPath, 'text/x-gff3')
  await addAssemblyViaApi(assemblyName, file._id)

  // Reload so JBrowse picks up the new assembly from config
  await page.reload()
  await waitForAppReady(page)

  await expect(
    page.getByRole('button', { name: 'Apollo' }),
  ).toBeEnabled({ timeout: 15_000 })

  if (launch) {
    await page.getByText('Launch view').click()
  }
}

export async function selectAssemblyToView(
  page: Page,
  assemblyName: string,
  location: string,
) {
  await expect(page.getByText('Select assembly to view')).toBeVisible({
    timeout: 10_000,
  })

  // Select assembly if not already selected
  const assemblySelector = page.locator(
    'input[data-testid="assembly-selector"]',
  )
  const selectorParent = assemblySelector.locator('..')
  const selectorText = await selectorParent.textContent()
  if (!selectorText?.includes(assemblyName)) {
    await selectorParent.click()
    await page.locator('li').filter({ hasText: assemblyName }).click()
  }

  // Navigate to location
  await page.locator('input[data-testid="autocomplete-input"]').fill(location)
  await page.locator('input[data-testid="autocomplete-input"]').press('Enter')
  await page.waitForTimeout(1000)
}

export async function annotationTrackAppearance(page: Page, option: string) {
  await page.getByText('Open track selector', { exact: false }).click()
  await page.getByText('Annotations (', { exact: false }).click()
  await page.getByRole('button', { name: 'Minimize drawer' }).click()

  const trackMenu = page.locator('[data-testid="track_menu_icon"]').first()
  await trackMenu.click()
  await page.getByText(option).click()
}
