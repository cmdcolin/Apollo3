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
const JBROWSE_DIR = path.join(
  REPO_ROOT,
  'packages/jbrowse-plugin-apollo/.jbrowse',
)
const VOLVOX_TEST_DATA = path.join(JBROWSE_DIR, 'test_data/volvox')
const FASTA_FILE = path.join(VOLVOX_TEST_DATA, 'volvox.fa')
const FAI_FILE = path.join(VOLVOX_TEST_DATA, 'volvox.fa.fai')
const PORT = 3998
const API_BASE = `http://127.0.0.1:${PORT}`
const DB_FILE = path.join(COLLAB_DIR, 'apollo-regen.sqlite')
const LOG_FILE = '/tmp/apollo-demo-regen.log'

function log(msg: string) {
  console.debug(msg)
}

const REGEN_EMAIL = 'admin@apollo-regen.example'
const REGEN_PASSWORD = 'regenpass1'

async function waitForSetupToken(maxWait = 60) {
  let waited = 0
  while (waited < maxWait) {
    const content = fs.readFileSync(LOG_FILE, 'utf8')
    const match = /SETUP_TOKEN=(.+)/.exec(content)
    if (match) {
      return match[1].trim()
    }
    await new Promise((r) => setTimeout(r, 2000))
    waited += 2
  }
  throw new Error(`Server did not become ready within ${maxWait}s`)
}

async function getToken() {
  const setupToken = await waitForSetupToken()
  log(`Server ready, running setup flow...`)
  await fetch(`${API_BASE}/auth/setup?token=${setupToken}`)
  const setupRes = await fetch(`${API_BASE}/auth/setup-account`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: REGEN_EMAIL,
      username: 'admin',
      password: REGEN_PASSWORD,
    }),
  })
  if (!setupRes.ok) {
    throw new Error(
      `Setup account failed: ${setupRes.status} ${await setupRes.text()}`,
    )
  }
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: REGEN_EMAIL, password: REGEN_PASSWORD }),
  })
  if (!loginRes.ok) {
    throw new Error(`Login failed: ${loginRes.status} ${await loginRes.text()}`)
  }
  const data = (await loginRes.json()) as { token: string }
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


async function main() {
  log('=== Regenerating demo database ===')

  // Verify prerequisites
  const mainJs = path.join(COLLAB_DIR, 'dist/main.js')
  if (!fs.existsSync(mainJs)) {
    throw new Error(
      'Server not built. Run: pnpm -C packages/apollo-collaboration-server dev:build',
    )
  }
  if (!fs.existsSync(FASTA_FILE)) {
    throw new Error(`FASTA file not found at ${FASTA_FILE}`)
  }
  if (!fs.existsSync(FAI_FILE)) {
    throw new Error(`FAI index not found at ${FAI_FILE}`)
  }

  // Create demo-data/volvox symlink so evidence track URIs and
  // sequenceSource relative paths work at runtime.
  const volvoxLink = path.join(DEMO_DATA_DIR, 'volvox')
  fs.mkdirSync(DEMO_DATA_DIR, { recursive: true })
  if (!fs.existsSync(volvoxLink)) {
    fs.symlinkSync(VOLVOX_TEST_DATA, volvoxLink)
    log(`  Created symlink: demo-data/volvox -> ${VOLVOX_TEST_DATA}`)
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
      DEFAULT_NEW_USER_ROLE: 'none',
      LOG_LEVELS: 'error,warn',
      NODE_ENV: 'development',
      JBROWSE_STATIC_DIR: JBROWSE_DIR,
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
      if (server.pid) {
        process.kill(-server.pid, 'SIGTERM')
      }
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
    const token = await getToken()
    log('Authenticated.')

    // Create organism first so assembly can reference it at creation time
    log('Creating Volvox carteri organism...')
    const organism = (await apiPost(token, 'organisms', {
      genus: 'Volvox',
      species: 'carteri',
      commonName: 'Volvox',
      description: 'Multicellular green alga',
    })) as { _id: string }
    log(`  organism created: ${organism._id}`)

    // Create assembly — server reads FASTA index to populate refSeqs.
    // Paths are relative to the server CWD (packages/apollo-collaboration-server/).
    log('Creating volvox assembly...')
    const faRelative = '../../demo-data/volvox/volvox.fa'
    const faiRelative = '../../demo-data/volvox/volvox.fa.fai'
    const volvoxAssembly = (await apiPost(token, 'assemblies', {
      name: 'volvox',
      visibility: 'public',
      organism: organism._id,
      sequenceSource: {
        type: 'fasta',
        fa: faRelative,
        fai: faiRelative,
      },
    })) as { _id: string }
    const volvoxId = volvoxAssembly._id
    log(`  assembly created: ${volvoxId}`)

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
      {
        trackId: 'volvox_gff3',
        name: 'volvox GFF3 annotations',
        category: ['Annotations'],
        config: {
          type: 'FeatureTrack',
          trackId: 'volvox_gff3',
          name: 'volvox GFF3 annotations',
          category: ['Annotations'],
          assemblyNames: ['volvox'],
          adapter: {
            type: 'Gff3TabixAdapter',
            gffGzLocation: {
              uri: 'volvox/volvox.sort.gff3.gz',
              locationType: 'UriLocation',
            },
            index: {
              location: {
                uri: 'volvox/volvox.sort.gff3.gz.tbi',
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

    // Build local BLAST databases for the volvox assembly
    log('Building local BLAST databases...')
    const localBlastDbs = [
      {
        name: 'volvox (nucleotide)',
        tool: 'local-blast',
        params: { program: 'blastn' },
        assemblyId: volvoxId,
      },
      {
        name: 'volvox (protein search)',
        tool: 'local-blast',
        params: { program: 'tblastn' },
        assemblyId: volvoxId,
      },
    ]
    for (const db of localBlastDbs) {
      log(`  ${db.name}`)
      await apiPost(token, 'analysis/databases/build', db)
    }
    // Wait for local DBs to finish building (volvox is tiny, should be fast)
    log('  Waiting for local BLAST DB builds to complete...')
    await new Promise((r) => setTimeout(r, 5000))
    log(`  ${localBlastDbs.length} local BLAST databases built.`)
  } finally {
    cleanup()
    // Wait for process to exit
    await new Promise((r) => setTimeout(r, 2000))
  }

  // Checkpoint WAL after the server has released the lock.
  try {
    execSync(`sqlite3 "${DB_FILE}" "PRAGMA wal_checkpoint(TRUNCATE);"`, {
      stdio: 'pipe',
    })
  } catch {
    // sqlite3 may not be installed; WAL will be merged on next open
  }

  // Clean up WAL files
  for (const ext of ['-wal', '-shm']) {
    const f = DB_FILE + ext
    if (fs.existsSync(f)) {
      fs.unlinkSync(f)
    }
  }

  fs.mkdirSync(DEMO_DATA_DIR, { recursive: true })
  const dest = path.join(DEMO_DATA_DIR, 'demo.sqlite')
  fs.renameSync(DB_FILE, dest)

  // Work around a MikroORM SQLite bug where JSON columns aren't persisted
  // in WAL mode. Patch the sequence_source directly via sqlite3.
  const faRel = '../../demo-data/volvox/volvox.fa'
  const faiRel = '../../demo-data/volvox/volvox.fa.fai'
  try {
    const src = JSON.stringify({
      type: 'fasta',
      fa: faRel,
      fai: faiRel,
    })
    const sql = `UPDATE assembly SET sequence_source = json('${src.replaceAll("'", "''")}');`
    execSync(`sqlite3 "${dest}"`, { input: sql })
    const check = execSync(
      `sqlite3 "${dest}" "SELECT sequence_source FROM assembly"`,
      { encoding: 'utf8' },
    ).trim()
    log(`Patched sequence_source: ${check}`)
  } catch (error) {
    log(`WARNING: Could not patch sequence_source: ${String(error)}`)
  }

  const stats = fs.statSync(dest)
  const sizeKB = Math.round(stats.size / 1024)
  log(`\nDemo database saved to demo-data/demo.sqlite (${sizeKB}KB)`)
}

try {
  await main()
} catch (error: unknown) {
  console.error(error)
  process.exit(1)
}
