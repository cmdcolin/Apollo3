#!/usr/bin/env node
// Seed a volvox assembly into a fresh Apollo server.
// Usage: node --experimental-strip-types seed-volvox.ts <gff3Path> <faPath> <faiPath>
//
// Expects ADMIN_EMAIL and ADMIN_PASSWORD env vars and an Apollo server running on
// http://127.0.0.1:3999 (or PORT env var).

import { readFileSync } from 'node:fs'

import { gff3LineToSnapshot } from '@apollo-annotation/shared'
import { parseStringSync } from '@gmod/gff'

const args = process.argv.slice(2)
const [gff3Path, faPath, faiPath] = args
if (!gff3Path || !faPath || !faiPath) {
  console.error('Usage: seed-volvox.ts <gff3Path> <faPath> <faiPath>')
  process.exit(1)
}

const port = process.env.PORT ?? '3999'
const API_BASE = `http://127.0.0.1:${port}`
const email = process.env.ADMIN_EMAIL ?? 'admin@apollo-dev.example'
const password = process.env.ADMIN_PASSWORD ?? 'devpass1'

const tokenRes = await fetch(`${API_BASE}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
})
if (!tokenRes.ok) {
  throw new Error(`Auth failed: ${tokenRes.status} ${await tokenRes.text()}`)
}
const { token } = (await tokenRes.json()) as { token: string }
const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
}

// Create organism first so assemblies can reference it at creation time
const organismRes = await fetch(`${API_BASE}/organisms`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    genus: 'Volvox',
    species: 'carteri',
    commonName: 'Volvox',
    description: 'Multicellular green alga',
  }),
})
if (!organismRes.ok) {
  throw new Error(
    `POST /organisms failed: ${organismRes.status} ${await organismRes.text()}`,
  )
}
const organism = (await organismRes.json()) as { _id: string }

const assemblyRes = await fetch(`${API_BASE}/assemblies`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    name: 'volvox',
    sequenceSource: { type: 'fasta', fa: faPath, fai: faiPath },
    visibility: 'public',
    organism: organism._id,
  }),
})
if (!assemblyRes.ok) {
  throw new Error(
    `POST /assemblies failed: ${assemblyRes.status} ${await assemblyRes.text()}`,
  )
}
const assembly = (await assemblyRes.json()) as { _id: string }
const assemblyId = assembly._id

const gff3Text = readFileSync(gff3Path, 'utf8')
const features = parseStringSync(gff3Text, { parseSequences: false })

let count = 0
for (const featureGroup of features) {
  if (!Array.isArray(featureGroup) || featureGroup.length === 0) {
    continue
  }
  const [line] = featureGroup
  if (!line.seq_id || !line.type) {
    continue
  }
  const snapshot = gff3LineToSnapshot(line, line.seq_id)
  const res = await fetch(`${API_BASE}/features`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ addedFeature: snapshot, assemblyId: 'volvox' }),
  })
  if (!res.ok) {
    console.warn(`Feature POST failed: ${res.status} ${await res.text()}`)
    continue
  }
  count++
}
// Add evidence tracks to the volvox assembly.
// assemblyIds uses the internal _id (for DB queries/permissions).
// config.assemblyNames uses the human-readable name (for JBrowse config).
const assemblyName = 'volvox'
const tracks = [
  {
    trackId: `volvox_bw`,
    assemblyIds: [assemblyId],
    config: {
      type: 'QuantitativeTrack',
      trackId: `volvox_bw`,
      name: 'Volvox BigWig',
      assemblyNames: [assemblyName],
      adapter: {
        type: 'BigWigAdapter',
        bigWigLocation: {
          uri: '/jbrowse/volvox/volvox.bw',
          locationType: 'UriLocation',
        },
      },
    },
  },
  {
    trackId: `volvox_bam`,
    assemblyIds: [assemblyId],
    config: {
      type: 'AlignmentsTrack',
      trackId: `volvox_bam`,
      name: 'Volvox Alignments (BAM)',
      assemblyNames: [assemblyName],
      adapter: {
        type: 'BamAdapter',
        bamLocation: {
          uri: '/jbrowse/volvox/volvox-sorted.bam',
          locationType: 'UriLocation',
        },
        index: {
          location: {
            uri: '/jbrowse/volvox/volvox-sorted.bam.bai',
            locationType: 'UriLocation',
          },
        },
      },
    },
  },
  {
    trackId: `volvox_vcf`,
    assemblyIds: [assemblyId],
    config: {
      type: 'VariantTrack',
      trackId: `volvox_vcf`,
      name: 'Volvox Variants (VCF)',
      assemblyNames: [assemblyName],
      adapter: {
        type: 'VcfTabixAdapter',
        vcfGzLocation: {
          uri: '/jbrowse/volvox/volvox.filtered.vcf.gz',
          locationType: 'UriLocation',
        },
        index: {
          location: {
            uri: '/jbrowse/volvox/volvox.filtered.vcf.gz.tbi',
            locationType: 'UriLocation',
          },
        },
      },
    },
  },
  {
    trackId: `volvox_bed`,
    assemblyIds: [assemblyId],
    config: {
      type: 'FeatureTrack',
      trackId: `volvox_bed`,
      name: 'Volvox BED12',
      assemblyNames: [assemblyName],
      adapter: {
        type: 'BedTabixAdapter',
        bedGzLocation: {
          uri: '/jbrowse/volvox/volvox-bed12.bed.gz',
          locationType: 'UriLocation',
        },
        index: {
          location: {
            uri: '/jbrowse/volvox/volvox-bed12.bed.gz.tbi',
            locationType: 'UriLocation',
          },
        },
      },
    },
  },
  {
    trackId: `volvox_rnaseq`,
    assemblyIds: [assemblyId],
    config: {
      type: 'AlignmentsTrack',
      trackId: `volvox_rnaseq`,
      name: 'Volvox RNA-seq',
      assemblyNames: [assemblyName],
      adapter: {
        type: 'BamAdapter',
        bamLocation: {
          uri: '/jbrowse/volvox/volvox-rnasim.bam',
          locationType: 'UriLocation',
        },
        index: {
          location: {
            uri: '/jbrowse/volvox/volvox-rnasim.bam.bai',
            locationType: 'UriLocation',
          },
        },
      },
    },
  },
]

for (const track of tracks) {
  const res = await fetch(`${API_BASE}/tracks`, {
    method: 'POST',
    headers,
    body: JSON.stringify(track),
  })
  if (!res.ok) {
    console.warn(
      `Track POST failed (${track.config.name}): ${res.status} ${await res.text()}`,
    )
  }
}
// Create a second, private assembly with the same data
const assembly2Res = await fetch(`${API_BASE}/assemblies`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    name: 'volvox2',
    sequenceSource: { type: 'fasta', fa: faPath, fai: faiPath },
    visibility: 'private',
    organism: organism._id,
  }),
})
if (!assembly2Res.ok) {
  throw new Error(
    `POST /assemblies (volvox2) failed: ${assembly2Res.status} ${await assembly2Res.text()}`,
  )
}
await assembly2Res.json()

let count2 = 0
for (const featureGroup of features) {
  if (!Array.isArray(featureGroup) || featureGroup.length === 0) {
    continue
  }
  const [line] = featureGroup
  if (!line.seq_id || !line.type) {
    continue
  }
  const snapshot = gff3LineToSnapshot(line, line.seq_id)
  const res = await fetch(`${API_BASE}/features`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ addedFeature: snapshot, assemblyId: 'volvox2' }),
  })
  if (!res.ok) {
    console.warn(
      `Feature POST (volvox2) failed: ${res.status} ${await res.text()}`,
    )
    continue
  }
  count2++
}
console.log(
  `[start] Seeded volvox (${count} features, ${tracks.length} tracks) + volvox2 (${count2} features)`,
)
