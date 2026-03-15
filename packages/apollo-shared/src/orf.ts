export interface Orf {
  splicedStart: number
  splicedEnd: number
  length: number
}

export interface ExonMapping {
  genomicMin: number
  genomicMax: number
  splicedStart: number
  splicedEnd: number
}

export interface ExonLike {
  min: number
  max: number
}

const STOP_CODONS = new Set(['TAA', 'TAG', 'TGA'])

function isStartCodon(codon: string) {
  return codon === 'ATG'
}

export function findLongestOrf(sequence: string): Orf | undefined {
  const seq = sequence.toUpperCase()
  let bestOrf: Orf | undefined

  for (let frame = 0; frame < 3; frame++) {
    let currentStart: number | undefined
    for (let i = frame; i + 2 < seq.length; i += 3) {
      const codon = seq.slice(i, i + 3)
      if (currentStart === undefined) {
        if (isStartCodon(codon)) {
          currentStart = i
        }
      } else if (STOP_CODONS.has(codon)) {
        const orfEnd = i + 3
        const length = orfEnd - currentStart
        if (!bestOrf || length > bestOrf.length) {
          bestOrf = { splicedStart: currentStart, splicedEnd: orfEnd, length }
        }
        currentStart = undefined
      }
    }
    if (currentStart !== undefined) {
      const orfEnd = seq.length - ((seq.length - frame) % 3)
      const length = orfEnd - currentStart
      if (!bestOrf || length > bestOrf.length) {
        bestOrf = { splicedStart: currentStart, splicedEnd: orfEnd, length }
      }
    }
  }
  return bestOrf
}

export function buildExonMappings(
  exons: ExonLike[],
  strand: number,
): ExonMapping[] {
  const sorted = [...exons].sort((a, b) =>
    strand === -1 ? b.max - a.max : a.min - b.min,
  )
  const mappings: ExonMapping[] = []
  let splicedOffset = 0
  for (const exon of sorted) {
    const len = exon.max - exon.min
    mappings.push({
      genomicMin: exon.min,
      genomicMax: exon.max,
      splicedStart: splicedOffset,
      splicedEnd: splicedOffset + len,
    })
    splicedOffset += len
  }
  return mappings
}

export function splicedToGenomic(
  splicedPos: number,
  mappings: ExonMapping[],
  strand: number,
) {
  for (const m of mappings) {
    if (splicedPos >= m.splicedStart && splicedPos <= m.splicedEnd) {
      const offset = splicedPos - m.splicedStart
      if (strand === -1) {
        return m.genomicMax - offset
      }
      return m.genomicMin + offset
    }
  }
  throw new Error(`Spliced position ${splicedPos} out of range`)
}
