export interface Assembly {
  _id: string
  name: string
  displayName?: string
}

export interface AnalysisDb {
  _id: string
  name: string
  tool: string
  dbPath?: string
  status: string
  params: Record<string, unknown>
  assemblyIds: string[]
}

export interface BlastHitDescription {
  accession: string
  sciname: string
  title: string
  id: string
}

export interface BlastHsp {
  bit_score: number
  evalue: number
  identity: number
  align_len: number
  query_from: number
  query_to: number
  hit_from: number
  hit_to: number
  qseq: string
  hseq: string
  midline: string
}

export interface BlastHit {
  description: BlastHitDescription[]
  hsps: BlastHsp[]
  len: number
  num: number
}

export interface BlastSearchResult {
  report: {
    results: {
      search: {
        hits: BlastHit[]
        query_len: number
        stat: { db_num: number; db_len: number }
      }
    }
  }
}

export interface PslHit {
  matches: number
  misMatches: number
  qName: string
  qSize: number
  qStart: number
  qEnd: number
  tName: string
  tSize: number
  tStart: number
  tEnd: number
  strand: string
  identity: number
  score: number
}

export interface GeneModel {
  seqName: string
  start: number
  end: number
  strand: string
  identity: string
  target: string
  exonCount: number
}

export interface IsPcrProduct {
  seqName: string
  start: number
  end: number
  strand: string
  size: number
  sequence: string
}

export const JOB_POLL_INTERVAL = 3000
export const MAX_POLL_ATTEMPTS = 200

export const BLAST_PROGRAMS = [
  { value: 'blastn', label: 'blastn — nucleotide → nucleotide' },
  { value: 'blastp', label: 'blastp — protein → protein' },
  { value: 'blastx', label: 'blastx — translated nucleotide → protein' },
  { value: 'tblastn', label: 'tblastn — protein → translated nucleotide' },
  {
    value: 'tblastx',
    label: 'tblastx — translated nucleotide → translated nucleotide',
  },
]

export const PROTEIN_PROGRAMS = new Set(['blastp', 'blastx'])

export const NCBI_DATABASES: Record<string, { value: string; label: string }[]> =
  {
    blastn: [
      { value: 'nt', label: 'nt (nucleotide collection)' },
      { value: 'refseq_rna', label: 'refseq_rna' },
      { value: 'refseq_genomic', label: 'refseq_genomic' },
    ],
    blastp: [
      { value: 'nr', label: 'nr (non-redundant protein)' },
      { value: 'refseq_protein', label: 'refseq_protein' },
      { value: 'swissprot', label: 'swissprot' },
      { value: 'pdb', label: 'pdb' },
    ],
    blastx: [
      { value: 'nr', label: 'nr (non-redundant protein)' },
      { value: 'refseq_protein', label: 'refseq_protein' },
      { value: 'swissprot', label: 'swissprot' },
    ],
    tblastn: [
      { value: 'nt', label: 'nt (nucleotide collection)' },
      { value: 'refseq_rna', label: 'refseq_rna' },
      { value: 'refseq_genomic', label: 'refseq_genomic' },
    ],
    tblastx: [
      { value: 'nt', label: 'nt (nucleotide collection)' },
      { value: 'refseq_rna', label: 'refseq_rna' },
    ],
  }

export const BLAT_QUERY_TYPES = [
  { value: 'dna', label: 'DNA' },
  { value: 'protein', label: 'Protein' },
]

export const TOOL_LABELS: Record<string, string> = {
  'local-blast': 'Local BLAST',
  blat: 'BLAT',
  miniprot: 'miniprot',
  ispcr: 'isPCR',
}

export const TOOL_DESCRIPTIONS: Record<string, string> = {
  'local-blast':
    'Search nucleotide or protein sequences against a local assembly database using BLAST.',
  blat: 'Fast genome alignment using UCSC BLAT. Best for high-identity same-species queries.',
  miniprot:
    'Align protein sequences to a genome to find gene models, including intron–exon structure.',
  ispcr: 'In-silico PCR: predict amplification products from a primer pair against a genome database.',
}

export const TAB_TOOLS = ['local-blast', 'blat', 'miniprot', 'ispcr']
