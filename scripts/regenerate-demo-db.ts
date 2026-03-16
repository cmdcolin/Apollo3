#!/usr/bin/env node --experimental-strip-types
// Regenerate the pre-built demo SQLite database (demo-data/demo.sqlite).
//
// Run this after schema changes to keep the demo DB in sync.
// Requires a built server: pnpm -C packages/apollo-collaboration-server dev:build
//
// Usage:
//   node --experimental-strip-types scripts/regenerate-demo-db.ts

import { execSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..')
const COLLAB_DIR = path.join(REPO_ROOT, 'packages/apollo-collaboration-server')
const DEMO_DATA_DIR = path.join(REPO_ROOT, 'demo-data')
const GFF3_FILE = path.join(DEMO_DATA_DIR, 'volvox/volvox-genes.gff3')
const PORT = 3998
const API_BASE = `http://127.0.0.1:${PORT}`
const DB_FILE = path.join(COLLAB_DIR, 'apollo-regen.sqlite')
const LOG_FILE = '/tmp/apollo-demo-regen.log'

function log(msg: string) {
  console.log(msg)
}

async function waitForServer(maxWait = 60) {
  let waited = 0
  while (waited < maxWait) {
    try {
      const res = await fetch(`${API_BASE}/health`)
      if (res.ok) {
        return
      }
    } catch {
      // server not ready yet
    }
    await new Promise((r) => setTimeout(r, 2000))
    waited += 2
  }
  throw new Error(`Server did not start within ${maxWait}s`)
}

async function getToken() {
  const res = await fetch(`${API_BASE}/auth/root`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'pass' }),
  })
  const data = (await res.json()) as { token: string }
  return data.token
}

async function apiPost(token: string, endpoint: string, body: unknown) {
  const res = await fetch(`${API_BASE}/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`POST /${endpoint} failed: ${res.status} ${text}`)
  }
  return res.json()
}

async function apiPatch(token: string, endpoint: string, body: unknown) {
  const res = await fetch(`${API_BASE}/${endpoint}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`PATCH /${endpoint} failed: ${res.status} ${text}`)
  }
  return res.json()
}

async function uploadFile(token: string, filePath: string, fileType: string) {
  const fileContent = fs.readFileSync(filePath)
  const fileName = path.basename(filePath)
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
    const text = await res.text()
    throw new Error(`File upload failed: ${res.status} ${text}`)
  }
  return res.json() as Promise<{ _id: string }>
}

function randomHexId() {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function main() {
  log('=== Regenerating demo database ===')

  // Verify prerequisites
  const mainJs = path.join(COLLAB_DIR, 'dist/main.js')
  if (!fs.existsSync(mainJs)) {
    throw new Error(
      'Server not built. Run: pnpm -C packages/apollo-collaboration-server dev:build',
    )
  }
  if (!fs.existsSync(GFF3_FILE)) {
    throw new Error(`GFF3 file not found at ${GFF3_FILE}`)
  }

  // Clean slate
  for (const f of [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`, LOG_FILE]) {
    if (fs.existsSync(f)) {
      fs.unlinkSync(f)
    }
  }

  // Start server on alternate port
  const logFd = fs.openSync(LOG_FILE, 'w')
  const server = spawn('node', ['dist/main.js'], {
    cwd: COLLAB_DIR,
    stdio: ['ignore', logFd, logFd],
    env: {
      ...process.env,
      PORT: String(PORT),
      URL: API_BASE,
      DB_CONNECTION_URL: 'apollo-regen.sqlite',
      ALLOW_ROOT_USER: 'true',
      ROOT_USER_PASSWORD: 'pass',
      ALLOW_GUEST_USER: 'true',
      GUEST_USER_ROLE: 'readOnly',
      DEFAULT_NEW_USER_ROLE: 'none',
      LOG_LEVELS: 'error,warn',
      NODE_ENV: 'development',
    },
    detached: true,
  })

  let cleaned = false
  const cleanup = () => {
    if (cleaned) {
      return
    }
    cleaned = true
    try {
      process.kill(-server.pid!, 'SIGTERM')
    } catch {
      // already dead
    }
    try {
      fs.closeSync(logFd)
    } catch {
      // already closed
    }
  }
  process.on('exit', cleanup)
  process.on('SIGINT', () => {
    cleanup()
    process.exit(1)
  })

  try {
    await waitForServer()
    log(`Server ready on port ${PORT}`)

    const token = await getToken()
    log('Authenticated as root.')

    // Upload GFF3 and create volvox assembly
    log('Uploading volvox GFF3...')
    const file = await uploadFile(token, GFF3_FILE, 'text/x-gff3')
    log(`  File uploaded: ${file._id}`)

    const volvoxId = randomHexId()
    log(`Adding volvox assembly (id=${volvoxId})...`)
    await apiPost(token, 'changes', {
      typeName: 'AddAssemblyAndFeaturesFromFileChange',
      assembly: volvoxId,
      assemblyName: 'volvox',
      sequenceSource: { type: 'chunked', fa: file._id },
    })
    log('  volvox assembly created.')

    // Set public visibility
    log('Setting visibility to public...')
    await apiPatch(token, `assemblies/${volvoxId}/visibility`, {
      visibility: 'public',
    })

    // Create organism
    log('Creating Volvox carteri organism...')
    const organism = (await apiPost(token, 'organisms', {
      genus: 'Volvox',
      species: 'carteri',
      commonName: 'Volvox',
      description: 'Multicellular green alga',
    })) as { _id: string }
    log(`  organism created: ${organism._id}`)

    // Assign organism to assembly
    log('Assigning assembly to organism...')
    await apiPatch(token, `assemblies/${volvoxId}/organism`, {
      organism: organism._id,
    })

    // Add evidence tracks
    // All URIs are relative to the JBrowse static root (/jbrowse/).
    // The demo-data/volvox/ directory is served at /jbrowse/volvox/.
    const tracks: {
      trackId: string
      name: string
      category: string[]
      config: Record<string, unknown>
    }[] = [
      {
        trackId: 'volvox_alignments',
        name: 'volvox-sorted.bam',
        category: ['Alignments'],
        config: {
          type: 'AlignmentsTrack',
          trackId: 'volvox_alignments',
          name: 'volvox-sorted.bam',
          category: ['Alignments'],
          assemblyNames: ['volvox'],
          adapter: {
            type: 'BamAdapter',
            bamLocation: {
              uri: 'volvox/volvox-sorted.bam',
              locationType: 'UriLocation',
            },
            index: {
              location: {
                uri: 'volvox/volvox-sorted.bam.bai',
                locationType: 'UriLocation',
              },
            },
          },
        },
      },
      {
        trackId: 'volvox_cram',
        name: 'volvox-sorted-altname.cram',
        category: ['Alignments'],
        config: {
          type: 'AlignmentsTrack',
          trackId: 'volvox_cram',
          name: 'volvox-sorted-altname.cram',
          category: ['Alignments'],
          assemblyNames: ['volvox'],
          adapter: {
            type: 'CramAdapter',
            cramLocation: {
              uri: 'volvox/volvox-sorted-altname.cram',
              locationType: 'UriLocation',
            },
            craiLocation: {
              uri: 'volvox/volvox-sorted-altname.cram.crai',
              locationType: 'UriLocation',
            },
          },
        },
      },
      {
        trackId: 'volvox_long_reads',
        name: 'volvox long reads (CRAM)',
        category: ['Alignments'],
        config: {
          type: 'AlignmentsTrack',
          trackId: 'volvox_long_reads',
          name: 'volvox long reads (CRAM)',
          category: ['Alignments'],
          assemblyNames: ['volvox'],
          adapter: {
            type: 'CramAdapter',
            cramLocation: {
              uri: 'volvox/volvox-long-reads-sv.cram',
              locationType: 'UriLocation',
            },
            craiLocation: {
              uri: 'volvox/volvox-long-reads-sv.cram.crai',
              locationType: 'UriLocation',
            },
          },
        },
      },
      {
        trackId: 'volvox_vcf',
        name: 'volvox variants',
        category: ['Variants'],
        config: {
          type: 'VariantTrack',
          trackId: 'volvox_vcf',
          name: 'volvox variants',
          category: ['Variants'],
          assemblyNames: ['volvox'],
          adapter: {
            type: 'VcfTabixAdapter',
            vcfGzLocation: {
              uri: 'volvox/volvox.test.vcf.gz',
              locationType: 'UriLocation',
            },
            index: {
              location: {
                uri: 'volvox/volvox.test.vcf.gz.tbi',
                locationType: 'UriLocation',
              },
            },
          },
        },
      },
      {
        trackId: 'volvox_filtered_vcf',
        name: 'volvox filtered variants',
        category: ['Variants'],
        config: {
          type: 'VariantTrack',
          trackId: 'volvox_filtered_vcf',
          name: 'volvox filtered variants',
          category: ['Variants'],
          assemblyNames: ['volvox'],
          adapter: {
            type: 'VcfTabixAdapter',
            vcfGzLocation: {
              uri: 'volvox/volvox.filtered.vcf.gz',
              locationType: 'UriLocation',
            },
            index: {
              location: {
                uri: 'volvox/volvox.filtered.vcf.gz.tbi',
                locationType: 'UriLocation',
              },
            },
          },
        },
      },
      {
        trackId: 'volvox_bigwig',
        name: 'volvox microarray',
        category: ['Quantitative'],
        config: {
          type: 'QuantitativeTrack',
          trackId: 'volvox_bigwig',
          name: 'volvox microarray',
          category: ['Quantitative'],
          assemblyNames: ['volvox'],
          adapter: {
            type: 'BigWigAdapter',
            bigWigLocation: {
              uri: 'volvox/volvox_microarray.bw',
              locationType: 'UriLocation',
            },
          },
        },
      },
      {
        trackId: 'volvox_paired_rnaseq',
        name: 'volvox paired RNA-seq',
        category: ['RNA-seq'],
        config: {
          type: 'AlignmentsTrack',
          trackId: 'volvox_paired_rnaseq',
          name: 'volvox paired RNA-seq',
          category: ['RNA-seq'],
          assemblyNames: ['volvox'],
          adapter: {
            type: 'BamAdapter',
            bamLocation: {
              uri: 'volvox/paired_rnaseq.bam',
              locationType: 'UriLocation',
            },
            index: {
              location: {
                uri: 'volvox/paired_rnaseq.bam.bai',
                locationType: 'UriLocation',
              },
            },
          },
        },
      },
      {
        trackId: 'volvox_stranded_rnaseq',
        name: 'volvox stranded RNA-seq',
        category: ['RNA-seq'],
        config: {
          type: 'AlignmentsTrack',
          trackId: 'volvox_stranded_rnaseq',
          name: 'volvox stranded RNA-seq',
          category: ['RNA-seq'],
          assemblyNames: ['volvox'],
          adapter: {
            type: 'BamAdapter',
            bamLocation: {
              uri: 'volvox/paired_end_stranded_rnaseq.bam',
              locationType: 'UriLocation',
            },
            index: {
              location: {
                uri: 'volvox/paired_end_stranded_rnaseq.bam.bai',
                locationType: 'UriLocation',
              },
            },
          },
        },
      },
      {
        trackId: 'volvox_gtf',
        name: 'volvox GTF',
        category: ['Annotations'],
        config: {
          type: 'FeatureTrack',
          trackId: 'volvox_gtf',
          name: 'volvox GTF',
          category: ['Annotations'],
          assemblyNames: ['volvox'],
          adapter: {
            type: 'GtfAdapter',
            gtfLocation: {
              uri: 'volvox/volvox.sorted.gtf.gz',
              locationType: 'UriLocation',
            },
            index: {
              location: {
                uri: 'volvox/volvox.sorted.gtf.gz.tbi',
                locationType: 'UriLocation',
              },
            },
          },
        },
      },
      {
        trackId: 'volvox_bed12',
        name: 'volvox BED12',
        category: ['Annotations'],
        config: {
          type: 'FeatureTrack',
          trackId: 'volvox_bed12',
          name: 'volvox BED12',
          category: ['Annotations'],
          assemblyNames: ['volvox'],
          adapter: {
            type: 'BedTabixAdapter',
            bedGzLocation: {
              uri: 'volvox/volvox-bed12.bed.gz',
              locationType: 'UriLocation',
            },
            index: {
              location: {
                uri: 'volvox/volvox-bed12.bed.gz.tbi',
                locationType: 'UriLocation',
              },
            },
          },
        },
      },
    ]

    log('Adding evidence tracks...')
    for (const track of tracks) {
      log(`  ${track.trackId}`)
      await apiPost(token, 'tracks', {
        trackId: track.trackId,
        assemblyIds: [volvoxId],
        config: track.config,
      })
    }
    log(`  ${tracks.length} evidence tracks added.`)
  } finally {
    // Checkpoint WAL before killing server
    try {
      execSync(`sqlite3 "${DB_FILE}" "PRAGMA wal_checkpoint(TRUNCATE);"`, {
        stdio: 'pipe',
      })
    } catch {
      // sqlite3 may not be installed; WAL will be merged on next open
    }

    cleanup()
    // Wait for process to exit
    await new Promise((r) => setTimeout(r, 1000))
  }

  // Clean up WAL files and move DB
  for (const ext of ['-wal', '-shm']) {
    const f = DB_FILE + ext
    if (fs.existsSync(f)) {
      fs.unlinkSync(f)
    }
  }

  fs.mkdirSync(DEMO_DATA_DIR, { recursive: true })
  const dest = path.join(DEMO_DATA_DIR, 'demo.sqlite')
  fs.renameSync(DB_FILE, dest)

  const stats = fs.statSync(dest)
  const sizeKB = Math.round(stats.size / 1024)
  log(`\nDemo database saved to demo-data/demo.sqlite (${sizeKB}KB)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
