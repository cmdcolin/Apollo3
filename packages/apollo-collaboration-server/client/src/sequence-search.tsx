import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Container from '@mui/material/Container'
import Divider from '@mui/material/Divider'
import FormControl from '@mui/material/FormControl'
import IconButton from '@mui/material/IconButton'
import InputLabel from '@mui/material/InputLabel'
import LinearProgress from '@mui/material/LinearProgress'
import Link from '@mui/material/Link'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Select from '@mui/material/Select'
import Tab from '@mui/material/Tab'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { Nav } from './Nav.js'
import { fetchJson } from './fetchUtil.js'

// ── Types ──────────────────────────────────────────────────────────────

interface Assembly {
  _id: string
  name: string
  displayName?: string
}

interface AnalysisDb {
  _id: string
  name: string
  tool: string
  dbPath?: string
  status: string
  params: Record<string, unknown>
  assemblyIds: string[]
}

interface BlastHitDescription {
  accession: string
  sciname: string
  title: string
  id: string
}

interface BlastHsp {
  bit_score: number
  evalue: number
  identity: number
  align_len: number
  query_from: number
  query_to: number
  hit_from: number
  hit_to: number
  hit_strand?: string
  qseq: string
  hseq: string
  midline: string
}

interface BlastHit {
  description: BlastHitDescription[]
  hsps: BlastHsp[]
  len: number
  num: number
}

interface BlastSearchResult {
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

// ── Constants ──────────────────────────────────────────────────────────

const JOB_POLL_INTERVAL = 3000
const MAX_POLL_ATTEMPTS = 200

const BLAST_PROGRAMS = [
  { value: 'blastn', label: 'blastn (nucleotide -> nucleotide)' },
  { value: 'blastp', label: 'blastp (protein -> protein)' },
  { value: 'blastx', label: 'blastx (translated nucl -> protein)' },
  { value: 'tblastn', label: 'tblastn (protein -> translated nucl)' },
  { value: 'tblastx', label: 'tblastx (translated nucl -> translated nucl)' },
]

const PROTEIN_PROGRAMS = new Set(['blastp', 'blastx'])

const NCBI_DATABASES: Record<string, { value: string; label: string }[]> = {
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

// ── Hooks ──────────────────────────────────────────────────────────────

interface UserInfo {
  username: string
  email: string
  role: string
}

function useCurrentUser() {
  const [user, setUser] = useState<UserInfo>()

  useEffect(() => {
    fetch('/users/me', { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setUser(data as UserInfo)
        }
      })
      .catch((error_: unknown) => {
        console.error('Failed to fetch user info', error_)
      })
  }, [])

  return user
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

interface AnalysisJob {
  _id: string
  status: string
  tool: string
  assemblyId?: string
  params: Record<string, unknown>
  results?: BlastSearchResult
  metadata?: Record<string, unknown>
  error?: string
  createdAt: string
}

interface SearchState {
  submitting: boolean
  jobId?: string
  status?: string
  tool?: string
  params?: Record<string, unknown>
  results?: BlastSearchResult
  error?: string
  submit: (
    tool: string,
    params: Record<string, unknown>,
    assemblyId?: string,
  ) => void
  cancel: () => void
}

function useAnalysisSearch(): SearchState {
  const [submitting, setSubmitting] = useState(false)
  const [jobId, setJobId] = useState<string>()
  const [status, setStatus] = useState<string>()
  const [tool, setTool] = useState<string>()
  const [params, setParams] = useState<Record<string, unknown>>()
  const [results, setResults] = useState<BlastSearchResult>()
  const [error, setError] = useState<string>()

  const submit = useCallback(
    (eng: string, jobParams: Record<string, unknown>, assemblyId?: string) => {
      setSubmitting(true)
      setError(undefined)
      setResults(undefined)
      setStatus(undefined)
      setJobId(undefined)
      setTool(eng)
      setParams(jobParams)

      async function run() {
        const response = await fetch('/analysis/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool: eng,
            params: jobParams,
            assemblyId,
          }),
        })
        if (!response.ok) {
          const text = await response.text()
          throw new Error(`${response.status}: ${text}`)
        }
        const job = (await response.json()) as AnalysisJob
        setJobId(job._id)
        setStatus(job.status)

        for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
          await delay(JOB_POLL_INTERVAL)
          const current = await fetchJson<AnalysisJob>(
            `/analysis/jobs/${job._id}`,
          )
          setStatus(current.status)

          if (current.status === 'ready') {
            setResults(current.results)
            return
          }
          if (current.status === 'failed' || current.status === 'cancelled') {
            throw new Error(current.error ?? `Job ${current.status}`)
          }
        }
        throw new Error('Search timed out after too many polling attempts')
      }

      void run()
        .catch((error_: unknown) => {
          setError(error_ instanceof Error ? error_.message : String(error_))
        })
        .finally(() => {
          setSubmitting(false)
        })
    },
    [],
  )

  const cancel = useCallback(() => {
    if (!jobId) {
      return
    }
    void fetch(`/analysis/jobs/${jobId}`, { method: 'DELETE' }).catch(
      (error_: unknown) => {
        console.error('Failed to cancel job', error_)
      },
    )
  }, [jobId])

  return {
    submitting,
    jobId,
    status,
    tool,
    params,
    results,
    error,
    submit,
    cancel,
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function getInitialAssembly() {
  const params = new URLSearchParams(globalThis.location.search)
  return params.get('assembly') ?? ''
}

function getFirstDbValue(programValue: string) {
  const [first] = NCBI_DATABASES[programValue]
  return first.value
}

function ncbiLinkForAccession(accession: string, isProteinResult: boolean) {
  const db = isProteinResult ? 'protein' : 'nuccore'
  return `https://www.ncbi.nlm.nih.gov/${db}/${accession}`
}

// ── Presentational components ──────────────────────────────────────────

function HitRow({
  hit,
  isLocal,
  isProteinResult,
}: {
  hit: BlastHit
  isLocal: boolean
  isProteinResult: boolean
}) {
  const desc = hit.description[0] as BlastHitDescription | undefined
  const [topHsp] = hit.hsps
  const identPct =
    topHsp.align_len > 0
      ? ((topHsp.identity / topHsp.align_len) * 100).toFixed(1)
      : '\u2014'

  return (
    <TableRow hover>
      <TableCell>{hit.num}</TableCell>
      <TableCell>
        <Typography
          variant="body2"
          sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
        >
          {desc ? desc.accession : ''}
        </Typography>
      </TableCell>
      <TableCell
        sx={{
          maxWidth: 300,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {desc ? desc.title : ''}
      </TableCell>
      <TableCell align="right">{topHsp.bit_score.toFixed(1)}</TableCell>
      <TableCell align="right">{topHsp.evalue.toExponential(2)}</TableCell>
      <TableCell align="right">{identPct}%</TableCell>
      <TableCell>
        {topHsp.query_from}&ndash;{topHsp.query_to}
      </TableCell>
      <TableCell>
        {topHsp.hit_from}&ndash;{topHsp.hit_to}
      </TableCell>
      <TableCell>
        {desc && !isLocal ? (
          <Link
            href={ncbiLinkForAccession(desc.accession, isProteinResult)}
            target="_blank"
            rel="noopener"
            variant="body2"
          >
            NCBI
          </Link>
        ) : null}
      </TableCell>
    </TableRow>
  )
}

function HitAlignment({ hit }: { hit: BlastHit }) {
  const desc = hit.description[0] as BlastHitDescription | undefined

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
        {hit.num}. {desc ? desc.accession : 'Unknown'} &mdash;{' '}
        {desc ? desc.title : ''}
      </Typography>
      {hit.hsps.map((hsp, i) => (
        <Box
          key={i}
          component="pre"
          sx={{
            fontSize: '0.75rem',
            fontFamily: 'monospace',
            overflow: 'auto',
            bgcolor: 'grey.50',
            p: 1,
            borderRadius: 1,
            mb: 1,
          }}
        >
          {`Score: ${hsp.bit_score.toFixed(1)} bits  E-value: ${hsp.evalue.toExponential(2)}  Identity: ${hsp.identity}/${hsp.align_len}\n`}
          {`Query  ${String(hsp.query_from).padStart(8)}  ${hsp.qseq}  ${hsp.query_to}\n`}
          {`               ${hsp.midline}\n`}
          {`Sbjct  ${String(hsp.hit_from).padStart(8)}  ${hsp.hseq}  ${hsp.hit_to}`}
        </Box>
      ))}
    </Box>
  )
}

function AssemblyChip({
  id,
  assemblies,
}: {
  id: string
  assemblies: Assembly[]
}) {
  const asm = assemblies.find((a) => a._id === id)
  return (
    <Chip
      label={asm ? (asm.displayName ?? asm.name) : id}
      size="small"
      sx={{ mr: 0.5 }}
    />
  )
}

// ── Local Tool Search Tab ──────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  'local-blast': 'Local BLAST',
  blat: 'BLAT',
  miniprot: 'miniprot',
}

const TOOL_DESCRIPTIONS: Record<string, string> = {
  'local-blast':
    'Search nucleotide or protein sequences against local assembly databases using BLAST.',
  blat: 'Fast genome alignment using UCSC BLAT. Best for high-identity same-species queries.',
  miniprot:
    'Align protein sequences to a genome to find gene models, including intron-exon structure.',
}

function LocalToolSearchTab({
  tool,
  assemblies,
  analysisDbs,
  search,
  canSubmit,
}: {
  tool: string
  assemblies: Assembly[]
  analysisDbs: AnalysisDb[]
  search: SearchState
  canSubmit: boolean
}) {
  const dbs = analysisDbs.filter(
    (db) => db.tool === tool && db.status === 'ready',
  )
  const [selectedDb, setSelectedDb] = useState('')
  const [query, setQuery] = useState('')

  const selectedDbConfig = dbs.find((d) => d._id === selectedDb)
  const description = TOOL_DESCRIPTIONS[tool] ?? ''
  const isProteinInput = tool === 'miniprot'

  return (
    <Box>
      {description ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {description}
        </Typography>
      ) : null}

      {dbs.length === 0 ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          No {TOOL_LABELS[tool] ?? tool} databases configured. An admin can
          build databases from assemblies in the admin panel below.
        </Alert>
      ) : (
        <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
          <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
            <FormControl size="small" sx={{ minWidth: 300 }}>
              <InputLabel>Database</InputLabel>
              <Select
                value={selectedDb}
                label="Database"
                onChange={(e) => {
                  setSelectedDb(e.target.value)
                }}
              >
                {dbs.map((db) => {
                  const asm = assemblies.find((a) =>
                    db.assemblyIds.includes(a._id),
                  )
                  const asmName = asm
                    ? (asm.displayName ?? asm.name)
                    : 'unknown'
                  const extra = db.params.program
                    ? ` (${String(db.params.program)})`
                    : ''
                  return (
                    <MenuItem key={db._id} value={db._id}>
                      {db.name}
                      {extra} &mdash; {asmName}
                    </MenuItem>
                  )
                })}
              </Select>
            </FormControl>
          </Box>

          <TextField
            label={
              isProteinInput
                ? 'Protein sequence (FASTA or plain)'
                : 'Query sequence (FASTA or plain)'
            }
            multiline
            minRows={6}
            maxRows={20}
            fullWidth
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
            }}
            sx={{ mb: 2 }}
            slotProps={{ input: { sx: { fontFamily: 'monospace' } } }}
          />

          <Button
            variant="contained"
            disabled={
              search.submitting ||
              query.trim().length === 0 ||
              !selectedDb ||
              !canSubmit
            }
            onClick={() => {
              if (selectedDbConfig) {
                const params: Record<string, unknown> = {
                  query,
                  databaseId: selectedDb,
                }
                if (selectedDbConfig.params.program) {
                  params.program = selectedDbConfig.params.program
                }
                search.submit(tool, params, selectedDbConfig.assemblyIds[0])
              }
            }}
          >
            {search.submitting ? 'Searching...' : 'Search'}
          </Button>
        </Paper>
      )}
    </Box>
  )
}

// ── NCBI Search Tab ───────────────────────────────────────────────────

function NcbiSearchTab({
  assemblies,
  analysisDbs,
  selectedAssembly,
  setSelectedAssembly,
  blast,
  canSubmit,
}: {
  assemblies: Assembly[]
  analysisDbs: AnalysisDb[]
  selectedAssembly: string
  setSelectedAssembly: (v: string) => void
  blast: SearchState
  canSubmit: boolean
}) {
  const ncbiDbs = analysisDbs.filter((db) => db.tool === 'ncbi-blast')
  const [program, setProgram] = useState('blastn')
  const [database, setDatabase] = useState('nt')
  const [query, setQuery] = useState('')

  const availableDatabases = NCBI_DATABASES[program] ?? []

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        Remote NCBI BLAST is useful for functional annotation — searching your
        sequences against public databases like nr and nt. Results link to NCBI
        accessions, not your local assemblies.
      </Alert>

      {ncbiDbs.length > 0 ? (
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Configured NCBI databases
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {ncbiDbs.map((db) => (
              <Button
                key={db._id}
                variant="outlined"
                size="small"
                onClick={() => {
                  setProgram(String(db.params.program ?? ''))
                  setDatabase(String(db.params.database ?? ''))
                }}
              >
                {db.name} ({db.params.program}/{db.params.database})
              </Button>
            ))}
          </Box>
        </Paper>
      ) : null}

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Assembly (optional)</InputLabel>
            <Select
              value={selectedAssembly}
              label="Assembly (optional)"
              onChange={(e) => {
                setSelectedAssembly(e.target.value)
              }}
            >
              <MenuItem value="">All assemblies</MenuItem>
              {assemblies.map((a) => (
                <MenuItem key={a._id} value={a._id}>
                  {a.displayName ?? a.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 280 }}>
            <InputLabel>Program</InputLabel>
            <Select
              value={program}
              label="Program"
              onChange={(e) => {
                setProgram(e.target.value)
                setDatabase(getFirstDbValue(e.target.value))
              }}
            >
              {BLAST_PROGRAMS.map((p) => (
                <MenuItem key={p.value} value={p.value}>
                  {p.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 240 }}>
            <InputLabel>Database</InputLabel>
            <Select
              value={database}
              label="Database"
              onChange={(e) => {
                setDatabase(e.target.value)
              }}
            >
              {availableDatabases.map((d) => (
                <MenuItem key={d.value} value={d.value}>
                  {d.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        <TextField
          label="Query sequence (FASTA or plain)"
          multiline
          minRows={6}
          maxRows={20}
          fullWidth
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
          }}
          sx={{ mb: 2 }}
          slotProps={{ input: { sx: { fontFamily: 'monospace' } } }}
        />

        <Button
          variant="contained"
          disabled={blast.submitting || query.trim().length === 0 || !canSubmit}
          onClick={() => {
            blast.submit('ncbi-blast', { program, database, query })
          }}
        >
          {blast.submitting ? 'Searching...' : 'Search NCBI'}
        </Button>
      </Paper>
    </Box>
  )
}

// ── Results ───────────────────────────────────────────────────────────

// ── BLAT results ──────────────────────────────────────────────────────

interface PslHit {
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

function BlatResultsTable({ hits }: { hits: PslHit[] }) {
  return (
    <Paper variant="outlined" sx={{ mb: 3 }}>
      <Typography variant="h6" sx={{ p: 2, pb: 1 }}>
        BLAT Results ({hits.length} hits)
      </Typography>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>#</TableCell>
              <TableCell>Query</TableCell>
              <TableCell>Target</TableCell>
              <TableCell>Strand</TableCell>
              <TableCell align="right">Score</TableCell>
              <TableCell align="right">Identity</TableCell>
              <TableCell>Query Range</TableCell>
              <TableCell>Target Range</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {hits.map((hit, i) => (
              <TableRow key={i} hover>
                <TableCell>{i + 1}</TableCell>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                  {hit.qName}
                </TableCell>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                  {hit.tName}
                </TableCell>
                <TableCell>{hit.strand}</TableCell>
                <TableCell align="right">{hit.score}</TableCell>
                <TableCell align="right">{hit.identity.toFixed(1)}%</TableCell>
                <TableCell>
                  {hit.qStart}&ndash;{hit.qEnd}
                </TableCell>
                <TableCell>
                  {hit.tStart}&ndash;{hit.tEnd}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  )
}

// ── miniprot results ──────────────────────────────────────────────────

interface GeneModel {
  seqName: string
  start: number
  end: number
  strand: string
  identity: string
  target: string
  exonCount: number
}

function MiniprotResultsTable({
  geneModels,
  gff3,
}: {
  geneModels: GeneModel[]
  gff3: string
}) {
  return (
    <>
      <Paper variant="outlined" sx={{ mb: 3 }}>
        <Typography variant="h6" sx={{ p: 2, pb: 1 }}>
          miniprot Gene Models ({geneModels.length})
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>#</TableCell>
                <TableCell>Sequence</TableCell>
                <TableCell>Strand</TableCell>
                <TableCell>Range</TableCell>
                <TableCell>Exons</TableCell>
                <TableCell>Identity</TableCell>
                <TableCell>Target</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {geneModels.map((gm, i) => (
                <TableRow key={i} hover>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell
                    sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                  >
                    {gm.seqName}
                  </TableCell>
                  <TableCell>{gm.strand}</TableCell>
                  <TableCell>
                    {gm.start}&ndash;{gm.end}
                  </TableCell>
                  <TableCell>{gm.exonCount}</TableCell>
                  <TableCell>{gm.identity}</TableCell>
                  <TableCell
                    sx={{
                      maxWidth: 300,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {gm.target}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
      {gff3 ? (
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            GFF3 Output
          </Typography>
          <Box
            component="pre"
            sx={{
              fontSize: '0.75rem',
              fontFamily: 'monospace',
              overflow: 'auto',
              bgcolor: 'grey.50',
              p: 1,
              borderRadius: 1,
              maxHeight: 400,
            }}
          >
            {gff3}
          </Box>
        </Paper>
      ) : null}
    </>
  )
}

// ── Generic results dispatcher ────────────────────────────────────────

function SearchResults({ search }: { search: SearchState }) {
  const tool = search.tool ?? ''
  const results = search.results

  return (
    <>
      {search.submitting ? (
        <Paper variant="outlined" sx={{ p: 3, mb: 3, textAlign: 'center' }}>
          <CircularProgress size={24} sx={{ mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            {TOOL_LABELS[tool] ?? tool} search in progress... Job:{' '}
            {search.jobId} &mdash; Status: {search.status}
          </Typography>
          <LinearProgress sx={{ mt: 2 }} />
          <Button
            variant="outlined"
            color="error"
            size="small"
            sx={{ mt: 2 }}
            onClick={() => {
              search.cancel()
            }}
          >
            Cancel
          </Button>
        </Paper>
      ) : null}

      {search.error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {search.error}
        </Alert>
      ) : null}

      {results && tool === 'blat' ? (
        <BlatResultsTable hits={(results as { hits: PslHit[] }).hits ?? []} />
      ) : null}

      {results && tool === 'miniprot' ? (
        <MiniprotResultsTable
          geneModels={(results as { geneModels: GeneModel[] }).geneModels ?? []}
          gff3={String((results as { gff3: string }).gff3 ?? '')}
        />
      ) : null}

      {results && (tool === 'local-blast' || tool === 'ncbi-blast')
        ? (() => {
            const blastResults = results as BlastSearchResult
            const hits = blastResults?.report?.results?.search?.hits
            const program = String(search.params?.program ?? '')
            const isProteinResult = PROTEIN_PROGRAMS.has(program)
            const isLocal = tool === 'local-blast'

            if (!hits) {
              return null
            }
            return (
              <>
                <Paper variant="outlined" sx={{ mb: 3 }}>
                  <Typography variant="h6" sx={{ p: 2, pb: 1 }}>
                    Results ({hits.length} hits)
                  </Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>#</TableCell>
                          <TableCell>Accession</TableCell>
                          <TableCell>Description</TableCell>
                          <TableCell align="right">Score</TableCell>
                          <TableCell align="right">E-value</TableCell>
                          <TableCell align="right">Identity</TableCell>
                          <TableCell>Query Range</TableCell>
                          <TableCell>Hit Range</TableCell>
                          <TableCell>{isLocal ? '' : 'NCBI'}</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {hits.map((hit) => (
                          <HitRow
                            key={hit.num}
                            hit={hit}
                            isLocal={isLocal}
                            isProteinResult={isProteinResult}
                          />
                        ))}
                        {hits.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={9}
                              align="center"
                              sx={{ color: 'text.secondary' }}
                            >
                              No hits found
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Paper>

                {hits.length > 0 ? (
                  <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                      Alignment Details
                    </Typography>
                    {hits.slice(0, 20).map((hit) => (
                      <HitAlignment key={hit.num} hit={hit} />
                    ))}
                  </Paper>
                ) : null}
              </>
            )
          })()
        : null}
    </>
  )
}

// ── Main page ──────────────────────────────────────────────────────────

const LOCAL_TOOLS = ['local-blast', 'blat', 'miniprot']

function SequenceSearchPage() {
  const user = useCurrentUser()
  const [assemblies, setAssemblies] = useState<Assembly[]>([])
  const [analysisDbs, setAnalysisDbs] = useState<AnalysisDb[]>([])
  const [selectedAssembly, setSelectedAssembly] = useState(getInitialAssembly)
  const [tab, setTab] = useState(0)
  const [loadError, setLoadError] = useState<string>()
  const search = useAnalysisSearch()

  const loadAssemblies = useCallback(async () => {
    try {
      const data = await fetchJson<Assembly[]>('/assemblies')
      setAssemblies(data)
    } catch (error_) {
      const msg = error_ instanceof Error ? error_.message : String(error_)
      console.error('Failed to load assemblies', error_)
      setLoadError(msg)
    }
  }, [])

  const loadDatabases = useCallback(async () => {
    try {
      const url = selectedAssembly
        ? `/analysis/databases?assembly=${selectedAssembly}`
        : '/analysis/databases'
      const data = await fetchJson<AnalysisDb[]>(url)
      setAnalysisDbs(data)
    } catch (error_) {
      const msg = error_ instanceof Error ? error_.message : String(error_)
      console.error('Failed to load databases', error_)
      setLoadError(msg)
    }
  }, [selectedAssembly])

  useEffect(() => {
    void loadAssemblies()
  }, [loadAssemblies])

  useEffect(() => {
    void loadDatabases()
  }, [loadDatabases])

  const canSubmit = user?.role === 'admin' || user?.role === 'user'

  const tabTools = [...LOCAL_TOOLS, 'ncbi-blast']
  const selectedTool = tabTools[tab] ?? 'local-blast'

  return (
    <Nav>
      <Container maxWidth="lg">
        <Typography variant="h4" sx={{ mb: 3 }}>
          Sequence Search
        </Typography>

        {loadError ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {loadError}
          </Alert>
        ) : null}

        {canSubmit ? null : (
          <Alert severity="info" sx={{ mb: 2 }}>
            Sequence search requires a logged-in user account. Guest and
            read-only users cannot submit searches.
          </Alert>
        )}

        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs
            value={tab}
            onChange={(_e, v) => {
              setTab(v as number)
            }}
          >
            {tabTools.map((t) => (
              <Tab key={t} label={TOOL_LABELS[t] ?? t} />
            ))}
          </Tabs>
        </Box>

        {selectedTool === 'ncbi-blast' ? (
          <NcbiSearchTab
            assemblies={assemblies}
            analysisDbs={analysisDbs}
            selectedAssembly={selectedAssembly}
            setSelectedAssembly={setSelectedAssembly}
            blast={search}
            canSubmit={canSubmit}
          />
        ) : (
          <LocalToolSearchTab
            tool={selectedTool}
            assemblies={assemblies}
            analysisDbs={analysisDbs}
            search={search}
            canSubmit={canSubmit}
          />
        )}

        <SearchResults search={search} />

        {user?.role === 'admin' ? (
          <AdminDatabasePanel
            assemblies={assemblies}
            analysisDbs={analysisDbs}
            onChanged={() => {
              void loadDatabases()
            }}
          />
        ) : null}
      </Container>
    </Nav>
  )
}

// ── Admin panel ────────────────────────────────────────────────────────

function AdminDatabasePanel({
  assemblies,
  analysisDbs,
  onChanged,
}: {
  assemblies: Assembly[]
  analysisDbs: AnalysisDb[]
  onChanged: () => void
}) {
  const [buildAssembly, setBuildAssembly] = useState('')
  const [buildTool, setBuildTool] = useState('local-blast')
  const [buildProgram, setBuildProgram] = useState('blastn')
  const [buildName, setBuildName] = useState('')
  const [building, setBuilding] = useState(false)

  const [ncbiName, setNcbiName] = useState('')
  const [ncbiProgram, setNcbiProgram] = useState('blastn')
  const [ncbiDatabase, setNcbiDatabase] = useState('nt')
  const [ncbiAssemblyIds, setNcbiAssemblyIds] = useState<string[]>([])
  const [savingNcbi, setSavingNcbi] = useState(false)

  const [adminError, setAdminError] = useState<string>()

  const handleBuildLocal = useCallback(async () => {
    setBuilding(true)
    setAdminError(undefined)
    try {
      const res = await fetch('/analysis/databases/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assemblyId: buildAssembly,
          tool: buildTool,
          name: buildName,
          params: buildTool === 'local-blast' ? { program: buildProgram } : {},
        }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`${res.status}: ${text}`)
      }
      setBuildName('')
      setBuildAssembly('')
      onChanged()
    } catch (error_) {
      setAdminError(error_ instanceof Error ? error_.message : String(error_))
    }
    setBuilding(false)
  }, [buildAssembly, buildTool, buildProgram, buildName, onChanged])

  const handleCreateNcbi = useCallback(async () => {
    setSavingNcbi(true)
    setAdminError(undefined)
    try {
      const res = await fetch('/analysis/databases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: ncbiName,
          tool: 'ncbi-blast',
          params: { program: ncbiProgram, database: ncbiDatabase },
          assemblyIds: ncbiAssemblyIds,
        }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`${res.status}: ${text}`)
      }
      setNcbiName('')
      setNcbiAssemblyIds([])
      onChanged()
    } catch (error_) {
      setAdminError(error_ instanceof Error ? error_.message : String(error_))
    }
    setSavingNcbi(false)
  }, [ncbiName, ncbiProgram, ncbiDatabase, ncbiAssemblyIds, onChanged])

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/analysis/databases/${id}`, {
          method: 'DELETE',
        })
        if (!res.ok) {
          const text = await res.text()
          throw new Error(`${res.status}: ${text}`)
        }
        onChanged()
      } catch (error_) {
        setAdminError(error_ instanceof Error ? error_.message : String(error_))
      }
    },
    [onChanged],
  )

  const ncbiAvailableDatabases = NCBI_DATABASES[ncbiProgram] ?? []

  return (
    <>
      <Divider sx={{ my: 4 }} />
      <Typography variant="h5" sx={{ mb: 2 }}>
        Admin: Configure Sequence Search Databases
      </Typography>

      {adminError ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {adminError}
        </Alert>
      ) : null}

      {analysisDbs.length > 0 ? (
        <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Tool</TableCell>
                <TableCell>Program</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Assemblies</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {analysisDbs.map((db) => (
                <TableRow key={db._id} hover>
                  <TableCell>{db.name}</TableCell>
                  <TableCell>
                    <Chip
                      label={db.tool}
                      size="small"
                      color={db.tool === 'local-blast' ? 'primary' : 'default'}
                    />
                  </TableCell>
                  <TableCell>{String(db.params.program ?? '')}</TableCell>
                  <TableCell>
                    <Chip
                      label={db.status}
                      size="small"
                      color={
                        db.status === 'ready'
                          ? 'success'
                          : db.status === 'building'
                            ? 'warning'
                            : 'error'
                      }
                    />
                  </TableCell>
                  <TableCell>
                    {db.assemblyIds.map((id) => (
                      <AssemblyChip key={id} id={id} assemblies={assemblies} />
                    ))}
                  </TableCell>
                  <TableCell>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => {
                        void handleDelete(db._id)
                      }}
                      title="Delete"
                    >
                      &#x2715;
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : null}

      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Build Local Database
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Extract sequences from an assembly and build a searchable database.
          Requires the selected tool to be installed on the server.
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
          <TextField
            label="Name"
            size="small"
            value={buildName}
            onChange={(e) => {
              setBuildName(e.target.value)
            }}
            sx={{ minWidth: 200 }}
          />
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Tool</InputLabel>
            <Select
              value={buildTool}
              label="Tool"
              onChange={(e) => {
                setBuildTool(e.target.value)
              }}
            >
              {LOCAL_TOOLS.map((eng) => (
                <MenuItem key={eng} value={eng}>
                  {TOOL_LABELS[eng] ?? eng}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Assembly</InputLabel>
            <Select
              value={buildAssembly}
              label="Assembly"
              onChange={(e) => {
                setBuildAssembly(e.target.value)
              }}
            >
              {assemblies.map((a) => (
                <MenuItem key={a._id} value={a._id}>
                  {a.displayName ?? a.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {buildTool === 'local-blast' ? (
            <FormControl size="small" sx={{ minWidth: 240 }}>
              <InputLabel>Program</InputLabel>
              <Select
                value={buildProgram}
                label="Program"
                onChange={(e) => {
                  setBuildProgram(e.target.value)
                }}
              >
                {BLAST_PROGRAMS.map((p) => (
                  <MenuItem key={p.value} value={p.value}>
                    {p.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : null}
        </Box>
        <Button
          variant="contained"
          size="small"
          disabled={building || buildName.trim().length === 0 || !buildAssembly}
          onClick={() => {
            void handleBuildLocal()
          }}
        >
          {building ? 'Building...' : 'Build Database'}
        </Button>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Add Remote NCBI BLAST Database
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
          <TextField
            label="Name"
            size="small"
            value={ncbiName}
            onChange={(e) => {
              setNcbiName(e.target.value)
            }}
            sx={{ minWidth: 200 }}
          />
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Program</InputLabel>
            <Select
              value={ncbiProgram}
              label="Program"
              onChange={(e) => {
                setNcbiProgram(e.target.value)
                setNcbiDatabase(getFirstDbValue(e.target.value))
              }}
            >
              {BLAST_PROGRAMS.map((p) => (
                <MenuItem key={p.value} value={p.value}>
                  {p.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Database</InputLabel>
            <Select
              value={ncbiDatabase}
              label="Database"
              onChange={(e) => {
                setNcbiDatabase(e.target.value)
              }}
            >
              {ncbiAvailableDatabases.map((d) => (
                <MenuItem key={d.value} value={d.value}>
                  {d.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Assemblies</InputLabel>
            <Select
              multiple
              value={ncbiAssemblyIds}
              label="Assemblies"
              onChange={(e) => {
                const val = e.target.value
                setNcbiAssemblyIds(
                  typeof val === 'string' ? val.split(',') : val,
                )
              }}
              renderValue={(selected) =>
                selected
                  .map((id) => {
                    const asm = assemblies.find((a) => a._id === id)
                    return asm ? (asm.displayName ?? asm.name) : id
                  })
                  .join(', ')
              }
            >
              {assemblies.map((a) => (
                <MenuItem key={a._id} value={a._id}>
                  {a.displayName ?? a.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
        <Button
          variant="contained"
          size="small"
          disabled={savingNcbi || ncbiName.trim().length === 0}
          onClick={() => {
            void handleCreateNcbi()
          }}
        >
          Add NCBI Database
        </Button>
      </Paper>
    </>
  )
}

const root = document.querySelector('#root')
if (root) {
  createRoot(root).render(<SequenceSearchPage />)
}
