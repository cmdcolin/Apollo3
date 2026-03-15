import { randomBytes } from 'node:crypto'

import type { AnnotationFeatureSnapshot } from '@apollo-annotation/mst'

interface GtfRecord {
  seqname: string
  source: string
  feature: string
  start: number
  end: number
  score: string
  strand: string
  frame: string
  attributes: Record<string, string>
}

const gtfTypeToSO: Record<string, string> = {
  gene: 'gene',
  transcript: 'mRNA',
  mRNA: 'mRNA',
  exon: 'exon',
  CDS: 'CDS',
  start_codon: 'start_codon',
  stop_codon: 'stop_codon',
  five_prime_utr: 'five_prime_UTR',
  three_prime_utr: 'three_prime_UTR',
}

function parseAttributes(attrString: string) {
  const attrs: Record<string, string> = {}
  const parts = attrString.split(';')
  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) {
      continue
    }
    const match = /^(\S+)\s+"?([^"]*)"?$/.exec(trimmed)
    if (match && match[1] && match[2] !== undefined) {
      attrs[match[1]] = match[2]
    }
  }
  return attrs
}

function parseGtfLine(line: string): GtfRecord | undefined {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) {
    return undefined
  }
  const fields = trimmed.split('\t')
  if (fields.length < 9) {
    return undefined
  }
  const [
    seqname,
    source,
    feature,
    startStr,
    endStr,
    score,
    strand,
    frame,
    attrStr,
  ] = fields
  if (
    !seqname ||
    !source ||
    !feature ||
    !startStr ||
    !endStr ||
    !score ||
    !strand ||
    !frame ||
    !attrStr
  ) {
    return undefined
  }
  return {
    seqname,
    source,
    feature,
    start: Number(startStr),
    end: Number(endStr),
    score,
    strand,
    frame,
    attributes: parseAttributes(attrStr),
  }
}

function strandToNum(s: string): 1 | -1 | undefined {
  if (s === '+') {
    return 1
  }
  if (s === '-') {
    return -1
  }
  return undefined
}

export function parseGtf(
  gtfText: string,
  refSeqId: string,
  regionStart: number,
) {
  const lines = gtfText.split('\n')
  const records: GtfRecord[] = []
  for (const line of lines) {
    const record = parseGtfLine(line)
    if (record) {
      records.push(record)
    }
  }

  const genes = new Map<
    string,
    {
      record: GtfRecord
      transcripts: Map<string, { record: GtfRecord; children: GtfRecord[] }>
    }
  >()

  for (const record of records) {
    const geneId = record.attributes.gene_id
    const transcriptId = record.attributes.transcript_id

    if (!geneId) {
      continue
    }

    if (record.feature === 'gene') {
      if (!genes.has(geneId)) {
        genes.set(geneId, { record, transcripts: new Map() })
      }
      continue
    }

    if (!genes.has(geneId)) {
      genes.set(geneId, {
        record: { ...record, feature: 'gene' },
        transcripts: new Map(),
      })
    }
    const gene = genes.get(geneId)!

    if (record.feature === 'transcript' || record.feature === 'mRNA') {
      if (transcriptId && !gene.transcripts.has(transcriptId)) {
        gene.transcripts.set(transcriptId, { record, children: [] })
      }
      continue
    }

    if (transcriptId) {
      if (!gene.transcripts.has(transcriptId)) {
        gene.transcripts.set(transcriptId, {
          record: { ...record, feature: 'transcript' },
          children: [],
        })
      }
      gene.transcripts.get(transcriptId)!.children.push(record)
    }
  }

  const features: AnnotationFeatureSnapshot[] = []

  for (const [geneId, gene] of genes) {
    const strand = strandToNum(gene.record.strand)
    const geneMin = gene.record.start - 1 + regionStart
    const geneMax = gene.record.end + regionStart

    const geneFeatureId = randomBytes(12).toString('hex')
    const transcriptSnapshots: Record<string, AnnotationFeatureSnapshot> = {}

    for (const [, transcript] of gene.transcripts) {
      const txId = randomBytes(12).toString('hex')
      const txMin = transcript.record.start - 1 + regionStart
      const txMax = transcript.record.end + regionStart

      const childSnapshots: Record<string, AnnotationFeatureSnapshot> = {}
      for (const child of transcript.children) {
        const childId = randomBytes(12).toString('hex')
        const soType = gtfTypeToSO[child.feature] ?? child.feature
        childSnapshots[childId] = {
          _id: childId,
          refSeq: refSeqId,
          type: soType,
          min: child.start - 1 + regionStart,
          max: child.end + regionStart,
          strand,
        } as AnnotationFeatureSnapshot
      }

      const txType = gtfTypeToSO[transcript.record.feature] ?? 'mRNA'
      const txSnapshot = {
        _id: txId,
        refSeq: refSeqId,
        type: txType,
        min: txMin,
        max: txMax,
        strand,
      } as AnnotationFeatureSnapshot
      if (Object.keys(childSnapshots).length > 0) {
        ;(
          txSnapshot as AnnotationFeatureSnapshot & {
            children: Record<string, AnnotationFeatureSnapshot>
          }
        ).children = childSnapshots
      }
      transcriptSnapshots[txId] = txSnapshot
    }

    const geneSnapshot = {
      _id: geneFeatureId,
      refSeq: refSeqId,
      type: 'gene',
      min: geneMin,
      max: geneMax,
      strand,
      attributes: { gff_id: [geneId] },
    } as AnnotationFeatureSnapshot
    if (Object.keys(transcriptSnapshots).length > 0) {
      ;(
        geneSnapshot as AnnotationFeatureSnapshot & {
          children: Record<string, AnnotationFeatureSnapshot>
        }
      ).children = transcriptSnapshots
    }
    features.push(geneSnapshot)
  }

  return features
}
