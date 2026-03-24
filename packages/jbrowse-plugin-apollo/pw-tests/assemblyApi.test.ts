import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  addAssemblyViaApi,
  deleteAssemblies,
  getGuestToken,
} from './helpers.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const GFF_PATH = path.resolve(__dirname, '../test_data/deleteFeature.gff3')
const API_BASE = 'http://127.0.0.1:3999'

test.afterEach(async () => {
  await deleteAssemblies()
})

test('Create assembly via API using file paths', async () => {
  const assemblyId = await addAssemblyViaApi('test-assembly', GFF_PATH)
  expect(assemblyId).toBeTruthy()

  // Verify assembly appears in config
  const token = await getGuestToken()
  const configRes = await fetch(`${API_BASE}/jbrowse/config.json`, {
    headers: { Authorization: `Bearer ${token}`, Connection: 'close' },
  })
  const config = (await configRes.json()) as {
    assemblies: { name: string; displayName: string }[]
  }
  console.log(
    `Assemblies in config: ${JSON.stringify(config.assemblies?.map((a) => a.displayName))}`,
  )
  expect(config.assemblies.length).toBeGreaterThan(0)
})
