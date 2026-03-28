#!/usr/bin/env node
// Seed a volvox assembly into a fresh Apollo server.
// Usage: node --experimental-strip-types seed-volvox.ts <gff3Path> <faPath> <faiPath>
//
// Expects ROOT_USER_PASSWORD env var and an Apollo server running on
// http://127.0.0.1:3999 (or PORT env var).

import { readFileSync } from 'node:fs'

import { gff3LineToSnapshot } from '@apollo-annotation/shared'
import { parseStringSync } from '@gmod/gff'

const [, , gff3Path, faPath, faiPath] = process.argv
if (!gff3Path || !faPath || !faiPath) {
  console.error('Usage: seed-volvox.ts <gff3Path> <faPath> <faiPath>')
  process.exit(1)
}

const port = process.env['PORT'] ?? '3999'
const API_BASE = `http://127.0.0.1:${port}`
const password = process.env['ROOT_USER_PASSWORD'] ?? 'devpass'

const tokenRes = await fetch(`${API_BASE}/auth/root`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password }),
})
if (!tokenRes.ok) {
  throw new Error(`Auth failed: ${tokenRes.status} ${await tokenRes.text()}`)
}
const { token } = (await tokenRes.json()) as { token: string }
const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
}

const assemblyRes = await fetch(`${API_BASE}/assemblies`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    name: 'volvox',
    sequenceSource: { type: 'fasta', fa: faPath, fai: faiPath },
    visibility: 'public',
  }),
})
if (!assemblyRes.ok) {
  throw new Error(
    `POST /assemblies failed: ${assemblyRes.status} ${await assemblyRes.text()}`,
  )
}
const assembly = (await assemblyRes.json()) as { _id: string }
const assemblyId = assembly._id
console.log(`Assembly created: ${assemblyId}`)


const refSeqsRes = await fetch(`${API_BASE}/refSeqs?assembly=${assemblyId}`, {
  headers,
})
const refSeqs = (await refSeqsRes.json()) as { _id: string; name: string }[]
const refSeqIdMap = new Map(refSeqs.map((rs) => [rs.name, rs._id]))
console.log(`RefSeqs: ${refSeqs.map((rs) => rs.name).join(', ')}`)

const gff3Text = readFileSync(gff3Path, 'utf8')
const features = parseStringSync(gff3Text, { parseSequences: false })

let count = 0
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
  const res = await fetch(`${API_BASE}/features`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ addedFeature: snapshot, assemblyId }),
  })
  if (!res.ok) {
    console.warn(`Feature POST failed: ${res.status} ${await res.text()}`)
    continue
  }
  count++
}
console.log(`Seeded ${count} top-level features`)

// Add evidence tracks to the volvox assembly
const tracks = [
  {
    trackId: `volvox_bw_${assemblyId}`,
    assemblyIds: [assemblyId],
    config: {
      type: 'QuantitativeTrack',
      trackId: `volvox_bw_${assemblyId}`,
      name: 'Volvox BigWig',
      assemblyNames: [assemblyId],
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
    trackId: `volvox_bam_${assemblyId}`,
    assemblyIds: [assemblyId],
    config: {
      type: 'AlignmentsTrack',
      trackId: `volvox_bam_${assemblyId}`,
      name: 'Volvox Alignments (BAM)',
      assemblyNames: [assemblyId],
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
    trackId: `volvox_vcf_${assemblyId}`,
    assemblyIds: [assemblyId],
    config: {
      type: 'VariantTrack',
      trackId: `volvox_vcf_${assemblyId}`,
      name: 'Volvox Variants (VCF)',
      assemblyNames: [assemblyId],
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
    trackId: `volvox_bed_${assemblyId}`,
    assemblyIds: [assemblyId],
    config: {
      type: 'FeatureTrack',
      trackId: `volvox_bed_${assemblyId}`,
      name: 'Volvox BED12',
      assemblyNames: [assemblyId],
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
    trackId: `volvox_rnaseq_${assemblyId}`,
    assemblyIds: [assemblyId],
    config: {
      type: 'AlignmentsTrack',
      trackId: `volvox_rnaseq_${assemblyId}`,
      name: 'Volvox RNA-seq',
      assemblyNames: [assemblyId],
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
console.log(`Added ${tracks.length} evidence tracks`)

// Create a second, private assembly with the same data
const assembly2Res = await fetch(`${API_BASE}/assemblies`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    name: 'volvox2',
    sequenceSource: { type: 'fasta', fa: faPath, fai: faiPath },
    visibility: 'private',
  }),
})
if (!assembly2Res.ok) {
  throw new Error(
    `POST /assemblies (volvox2) failed: ${assembly2Res.status} ${await assembly2Res.text()}`,
  )
}
const assembly2 = (await assembly2Res.json()) as { _id: string }
const assembly2Id = assembly2._id
console.log(`Private assembly created: ${assembly2Id}`)

const refSeqs2Res = await fetch(
  `${API_BASE}/refSeqs?assembly=${assembly2Id}`,
  { headers },
)
const refSeqs2 = (await refSeqs2Res.json()) as { _id: string; name: string }[]
const refSeqIdMap2 = new Map(refSeqs2.map((rs) => [rs.name, rs._id]))

let count2 = 0
for (const featureGroup of features) {
  if (!Array.isArray(featureGroup) || featureGroup.length === 0) {
    continue
  }
  const line = featureGroup[0]
  if (!line.seq_id || !line.type) {
    continue
  }
  const refSeqId = refSeqIdMap2.get(line.seq_id)
  if (!refSeqId) {
    continue
  }
  const snapshot = gff3LineToSnapshot(line, refSeqId)
  const res = await fetch(`${API_BASE}/features`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ addedFeature: snapshot, assemblyId: assembly2Id }),
  })
  if (!res.ok) {
    console.warn(
      `Feature POST (volvox2) failed: ${res.status} ${await res.text()}`,
    )
    continue
  }
  count2++
}
console.log(`Seeded ${count2} top-level features into volvox2`)
