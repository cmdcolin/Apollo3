import Chip from '@mui/material/Chip'
import Link from '@mui/material/Link'

import type { Assembly } from '../types.js'

// ── Text / data helpers ────────────────────────────────────────────────

export function blastQueryLabel(program: string) {
  if (program === 'blastp' || program === 'tblastn') {
    return 'Protein sequence (FASTA or plain)'
  }
  if (program === 'blastx' || program === 'tblastx') {
    return 'Nucleotide sequence — will be translated (FASTA or plain)'
  }
  return 'Nucleotide sequence (FASTA or plain)'
}

export function getFirstNcbiDb(
  databases: Record<string, { value: string; label: string }[]>,
  program: string,
) {
  const [first] = databases[program] ?? []
  return first?.value ?? ''
}

export function copyToClipboard(text: string) {
  void navigator.clipboard.writeText(text).catch((error: unknown) => {
    console.error('Clipboard write failed', error)
  })
}

// ── JBrowse URL building ───────────────────────────────────────────────

export interface JBrowseFeature {
  uniqueId: string
  refName: string
  start: number
  end: number
  name?: string
  score?: number
  strand?: 1 | -1 | 0
}

/**
 * Build a JBrowse URL that navigates to the first feature, sets the
 * assembly context, and adds a temporary FeatureTrack via FromConfigAdapter.
 */
export function buildJBrowseUrl(
  features: JBrowseFeature[],
  trackName: string,
  assemblyName: string,
) {
  if (features.length === 0) {
    return null
  }
  const [first] = features
  const loc = `${first.refName}:${first.start}..${first.end}`
  const trackId = `search_results_${Date.now()}`
  const sessionTracks = JSON.stringify([
    {
      type: 'FeatureTrack',
      trackId,
      name: trackName,
      assemblyNames: [assemblyName],
      adapter: {
        type: 'FromConfigAdapter',
        features,
      },
    },
  ])
  const params = new URLSearchParams({
    assembly: assemblyName,
    loc,
    sessionTracks,
    tracks: trackId,
  })
  return `/jbrowse/?${params.toString()}`
}

/** Navigate to a single location in JBrowse with assembly context. */
export function singleLocUrl(
  refName: string,
  start: number,
  end: number,
  assemblyName: string,
) {
  const loc = `${refName}:${start}..${end}`
  return `/jbrowse/?${new URLSearchParams({ assembly: assemblyName, loc }).toString()}`
}

// ── React components ───────────────────────────────────────────────────

export function AssemblyChip({
  id,
  assemblies,
}: {
  id: string
  assemblies: Assembly[]
}) {
  const asm = assemblies.find((a) => a._id === id)
  return (
    <Chip
      label={asm?.displayName ?? id}
      size="small"
      sx={{ mr: 0.5 }}
    />
  )
}

/**
 * A plain link showing the genomic location that opens the JBrowse
 * genome view at that location in a new tab.
 */
export function GenomeLink({
  refName,
  start,
  end,
  assemblyName,
}: {
  refName: string
  start: number
  end: number
  assemblyName: string
}) {
  return (
    <Link
      href={singleLocUrl(refName, start, end, assemblyName)}
      target="_blank"
      rel="noopener noreferrer"
      variant="body2"
      sx={{ fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
    >
      {refName}:{start}..{end} ↗
    </Link>
  )
}
