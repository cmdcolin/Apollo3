import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const GFF_PATH = path.resolve(__dirname, '../test_data/deleteFeature.gff3')
const API_BASE = 'http://localhost:3999'

test('Upload file via browser fetch', async ({ page }) => {
  // Load a minimal page
  await page.goto('http://localhost:8999')

  // Read file content and pass to browser
  const fileContent = readFileSync(GFF_PATH).toString('base64')

  const result = await page.evaluate(async ({ base64Content, apiBase }) => {
    // Get auth token
    const authRes = await fetch(`${apiBase}/auth/guest`)
    const { token } = await authRes.json() as { token: string }

    // Convert base64 to File
    const binaryString = atob(base64Content)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    const file = new File([bytes], 'deleteFeature.gff3', { type: 'application/octet-stream' })

    // Upload via FormData
    const formData = new FormData()
    formData.append('file', file, 'deleteFeature.gff3')
    formData.append('type', 'text/x-gff3')

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    try {
      const res = await fetch(`${apiBase}/files?type=text/x-gff3`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      const json = await res.json()
      return { status: res.status, body: json }
    } catch (e) {
      clearTimeout(timeoutId)
      return { error: String(e) }
    }
  }, { base64Content: fileContent, apiBase: API_BASE })

  console.log('Upload result:', JSON.stringify(result))
  expect(result).toHaveProperty('status', 201)
})
