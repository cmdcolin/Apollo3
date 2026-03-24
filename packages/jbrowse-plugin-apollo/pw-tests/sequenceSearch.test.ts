/**
 * E2E tests for the sequence search analysis job workflow.
 *
 * These tests exercise the full lifecycle:
 *   1. Build an analysis database for an assembly
 *   2. Submit a search job (blastn, blat, or isPcr)
 *   3. Poll until the job completes
 *   4. Verify the results contain expected data
 *
 * The server is started with mock_tools/ on PATH so no real BLAST/BLAT/isPCR
 * installation is required.
 */
import { expect, test } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { addAssemblyViaApi, deleteAssemblies, getGuestToken } from './helpers.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// volvox.fasta.gff3 has embedded FASTA so the sequence service can serve it
const GFF_PATH = path.resolve(__dirname, '../test_data/volvox.fasta.gff3')
const ASSEMBLY = 'volvox-seq-search'
const API_BASE = 'http://127.0.0.1:3999'

async function apiHeaders(): Promise<Record<string, string>> {
  const token = await getGuestToken()
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

async function buildDatabase(
  assemblyId: string,
  tool: string,
  name: string,
  params: Record<string, unknown> = {},
): Promise<string> {
  const headers = await apiHeaders()
  const res = await fetch(`${API_BASE}/analysis/databases/build`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ assemblyId, tool, name, params }),
  })
  expect(res.status).toBe(202)
  const db = (await res.json()) as { _id: string; status: string }
  return db._id
}

async function waitForDbReady(dbId: string, timeoutMs = 30_000): Promise<void> {
  const headers = await apiHeaders()
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const res = await fetch(`${API_BASE}/analysis/databases/${dbId}`, {
      headers,
    })
    expect(res.ok).toBe(true)
    const db = (await res.json()) as { status: string; error?: string }
    if (db.status === 'ready') {
      return
    }
    if (db.status === 'error') {
      throw new Error(`Database build failed: ${db.error ?? '(no message)'}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`Database did not become ready within ${timeoutMs}ms`)
}

async function submitJob(
  tool: string,
  assemblyId: string,
  params: Record<string, unknown>,
): Promise<string> {
  const headers = await apiHeaders()
  const res = await fetch(`${API_BASE}/analysis/jobs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ tool, assemblyId, params }),
  })
  expect(res.status).toBe(202)
  const job = (await res.json()) as { _id: string }
  return job._id
}

async function waitForJobReady(
  jobId: string,
  timeoutMs = 30_000,
): Promise<Record<string, unknown>> {
  const headers = await apiHeaders()
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const res = await fetch(`${API_BASE}/analysis/jobs/${jobId}`, { headers })
    expect(res.ok).toBe(true)
    const job = (await res.json()) as {
      status: string
      results: Record<string, unknown>
      error?: string
    }
    if (job.status === 'ready') {
      return job.results
    }
    if (job.status === 'failed') {
      throw new Error(`Job failed: ${job.error ?? '(no message)'}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`Job did not complete within ${timeoutMs}ms`)
}

test.beforeEach(async () => {
  await deleteAssemblies()
})

test.afterEach(async () => {
  await deleteAssemblies()
})

test('GET /analysis/tools lists available tools', async () => {
  const headers = await apiHeaders()
  const res = await fetch(`${API_BASE}/analysis/tools`, { headers })
  expect(res.ok).toBe(true)
  const tools = (await res.json()) as {
    tool: string
    installed: boolean
    canBuildDb: boolean
  }[]
  const toolNames = tools.map((t) => t.tool)
  expect(toolNames).toContain('local-blast')
  expect(toolNames).toContain('blat')
  expect(toolNames).toContain('ispcr')
  expect(toolNames).toContain('miniprot')

  const blast = tools.find((t) => t.tool === 'local-blast')
  expect(blast?.installed).toBe(true)
  expect(blast?.canBuildDb).toBe(true)
})

test('blastn: build DB, submit job, verify results contain hits', async () => {
  const assemblyId = await addAssemblyViaApi(ASSEMBLY, GFF_PATH)

  const dbId = await buildDatabase(assemblyId, 'local-blast', 'volvox-blastn', {
    program: 'blastn',
  })
  await waitForDbReady(dbId)

  const jobId = await submitJob('local-blast', assemblyId, {
    program: 'blastn',
    databaseId: dbId,
    query: '>testQuery\nATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCG',
  })
  const results = await waitForJobReady(jobId)

  // The mock blastn always returns one hit on ctgA
  const report = (results as { report?: { results?: { search?: { hits?: unknown[] } } } })
    .report
  expect(report?.results?.search?.hits?.length).toBeGreaterThan(0)
})

test('blat: build DB, submit job, verify results contain hits', async () => {
  const assemblyId = await addAssemblyViaApi(ASSEMBLY, GFF_PATH)

  const dbId = await buildDatabase(assemblyId, 'blat', 'volvox-blat')
  await waitForDbReady(dbId)

  const jobId = await submitJob('blat', assemblyId, {
    databaseId: dbId,
    query: '>testQuery\nATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCGATCG',
    queryType: 'dna',
  })
  const results = await waitForJobReady(jobId)

  const hits = (results as { hits?: unknown[] }).hits
  expect(hits?.length).toBeGreaterThan(0)
})

test('ispcr: build DB, submit job, verify results contain products', async () => {
  const assemblyId = await addAssemblyViaApi(ASSEMBLY, GFF_PATH)

  const dbId = await buildDatabase(assemblyId, 'ispcr', 'volvox-ispcr')
  await waitForDbReady(dbId)

  const jobId = await submitJob('ispcr', assemblyId, {
    databaseId: dbId,
    forwardPrimer: 'ATCGATCGATCG',
    reversePrimer: 'CGATCGATCGAT',
    maxSize: 4000,
  })
  const results = await waitForJobReady(jobId)

  const products = (results as { products?: unknown[] }).products
  expect(products?.length).toBeGreaterThan(0)
})

test('miniprot: build DB, submit job, verify results contain gene models', async () => {
  const assemblyId = await addAssemblyViaApi(ASSEMBLY, GFF_PATH)

  const dbId = await buildDatabase(assemblyId, 'miniprot', 'volvox-miniprot')
  await waitForDbReady(dbId)

  const jobId = await submitJob('miniprot', assemblyId, {
    databaseId: dbId,
    query: '>testProt\nMEPTIVLSSPGDLVRFLDAIL',
  })
  const results = await waitForJobReady(jobId)

  const geneModels = (results as { geneModels?: unknown[] }).geneModels
  expect(geneModels?.length).toBeGreaterThan(0)
})

test('job cancellation: cancelled job has status cancelled', async () => {
  const assemblyId = await addAssemblyViaApi(ASSEMBLY, GFF_PATH)
  const headers = await apiHeaders()

  // Submit a job — it will be pending briefly before the worker picks it up
  const jobId = await submitJob('local-blast', assemblyId, {
    program: 'blastn',
    databaseId: 'nonexistent-db',
    query: '>q\nATCG',
  })

  // Cancel the job immediately while it may still be pending
  const cancelRes = await fetch(`${API_BASE}/analysis/jobs/${jobId}`, {
    method: 'DELETE',
    headers,
  })
  // Either cancelled (200) or the job already finished — both are valid
  expect([200, 404]).toContain(cancelRes.status)

  if (cancelRes.status === 200) {
    const statusRes = await fetch(`${API_BASE}/analysis/jobs/${jobId}`, {
      headers,
    })
    const job = (await statusRes.json()) as { status: string }
    expect(job.status).toBe('cancelled')
  }
})

test('GET /analysis/databases filters by assembly', async () => {
  const assemblyId = await addAssemblyViaApi(ASSEMBLY, GFF_PATH)
  const headers = await apiHeaders()

  const dbId = await buildDatabase(assemblyId, 'local-blast', 'filter-test', {
    program: 'blastn',
  })
  await waitForDbReady(dbId)

  const res = await fetch(
    `${API_BASE}/analysis/databases?assembly=${assemblyId}`,
    { headers },
  )
  expect(res.ok).toBe(true)
  const dbs = (await res.json()) as { _id: string }[]
  expect(dbs.some((d) => d._id === dbId)).toBe(true)
})
