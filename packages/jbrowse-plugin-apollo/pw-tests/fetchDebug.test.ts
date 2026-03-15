import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const GFF_PATH = path.resolve(__dirname, '../test_data/deleteFeature.gff3')
const API_BASE = 'http://127.0.0.1:3999'

async function timedFetch(label: string, url: string, init?: RequestInit) {
  const start = Date.now()
  console.log(
    `[${label}] Starting ${init?.method ?? 'GET'} ${url.replace(API_BASE, '')}...`,
  )
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    console.log(`[${label}] TIMEOUT after ${Date.now() - start}ms — aborting`)
    controller.abort()
  }, 10_000)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    clearTimeout(timeout)
    const body = await res.text()
    const elapsed = Date.now() - start
    console.log(
      `[${label}] OK in ${elapsed}ms, status=${res.status}, body=${body.slice(0, 100)}`,
    )
    return { status: res.status, body: JSON.parse(body) }
  } catch (e) {
    clearTimeout(timeout)
    const elapsed = Date.now() - start
    console.log(`[${label}] FAILED in ${elapsed}ms: ${e}`)
    throw e
  }
}

test('Reproduce fetch hang with upload + assembly flow', async () => {
  // Step 1: Get token
  const { body: tokenData } = await timedFetch(
    '1-token',
    `${API_BASE}/auth/guest`,
  )
  const token = (tokenData as { token: string }).token

  // Step 2: Upload file
  const fileContent = readFileSync(GFF_PATH)
  const formData = new FormData()
  formData.append('file', new Blob([fileContent]), 'deleteFeature.gff3')
  const { body: uploadData } = await timedFetch(
    '2-upload',
    `${API_BASE}/files?type=text/x-gff3`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    },
  )
  const fileId = (uploadData as { _id: string })._id

  // Step 3: Get token again
  const { body: tokenData2 } = await timedFetch(
    '3-token',
    `${API_BASE}/auth/guest`,
  )
  const token2 = (tokenData2 as { token: string }).token

  // Step 4: Create assembly
  const assemblyId = 'aabbccddee112233aabbccdd'
  await timedFetch('4-assembly', `${API_BASE}/changes`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token2}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      typeName: 'AddAssemblyAndFeaturesFromFileChange',
      assembly: assemblyId,
      assemblyName: 'test',
      sequenceSource: { type: 'chunked', fa: fileId },
    }),
  })

  // Step 5: Get token AGAIN — this is the one that hangs
  await timedFetch('5-token', `${API_BASE}/auth/guest`)

  // Step 6: List assemblies
  await timedFetch('6-list', `${API_BASE}/assemblies`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  // Step 7: Delete assembly
  await timedFetch('7-delete', `${API_BASE}/changes`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      typeName: 'DeleteAssemblyChange',
      assembly: assemblyId,
    }),
  })

  console.log('All steps completed!')
})
