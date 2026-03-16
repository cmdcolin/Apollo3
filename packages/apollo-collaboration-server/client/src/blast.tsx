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
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
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

interface BlastDb {
  _id: string
  name: string
  program: string
  database: string
  assemblyIds: string[]
}

interface BlastHitDescription {
  accession: string
  sciname: string
  title: string
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

const NCBI_PROGRAMS = [
  { value: 'blastn', label: 'blastn (nucleotide \u2192 nucleotide)' },
  { value: 'blastp', label: 'blastp (protein \u2192 protein)' },
  { value: 'blastx', label: 'blastx (translated nucl \u2192 protein)' },
  { value: 'tblastn', label: 'tblastn (protein \u2192 translated nucl)' },
  {
    value: 'tblastx',
    label: 'tblastx (translated nucl \u2192 translated nucl)',
  },
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

interface BlastJob {
  _id: string
  status: string
  program: string
  database: string
  ncbiRid?: string
  results?: BlastSearchResult
  error?: string
  createdAt: string
}

interface BlastSearchState {
  submitting: boolean
  jobId?: string
  status?: string
  program?: string
  results?: BlastSearchResult
  error?: string
  submit: (program: string, database: string, query: string) => void
  cancel: () => void
}

function useBlastSearch(): BlastSearchState {
  const [submitting, setSubmitting] = useState(false)
  const [jobId, setJobId] = useState<string>()
  const [status, setStatus] = useState<string>()
  const [program, setProgram] = useState<string>()
  const [results, setResults] = useState<BlastSearchResult>()
  const [error, setError] = useState<string>()

  const submit = useCallback(
    (prog: string, database: string, query: string) => {
      setSubmitting(true)
      setError(undefined)
      setResults(undefined)
      setStatus(undefined)
      setJobId(undefined)
      setProgram(prog)

      async function run() {
        const response = await fetch('/blast/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ program: prog, database, query }),
        })
        if (!response.ok) {
          const text = await response.text()
          throw new Error(`${response.status}: ${text}`)
        }
        const job = (await response.json()) as BlastJob
        setJobId(job._id)
        setStatus(job.status)

        for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
          await delay(JOB_POLL_INTERVAL)
          const current = await fetchJson<BlastJob>(`/blast/jobs/${job._id}`)
          setStatus(current.status)

          if (current.status === 'ready') {
            setResults(current.results)
            return
          }
          if (
            current.status === 'failed' ||
            current.status === 'cancelled'
          ) {
            throw new Error(current.error ?? `BLAST job ${current.status}`)
          }
        }
        throw new Error(
          'BLAST search timed out after too many polling attempts',
        )
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
    void fetch(`/blast/jobs/${jobId}`, { method: 'DELETE' }).catch(
      (error_: unknown) => {
        console.error('Failed to cancel BLAST job', error_)
      },
    )
  }, [jobId])

  return { submitting, jobId, status, program, results, error, submit, cancel }
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
  isProteinResult,
}: {
  hit: BlastHit
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
      <TableCell>
        <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
          {desc ? desc.sciname : ''}
        </Typography>
      </TableCell>
      <TableCell align="right">{topHsp.bit_score.toFixed(1)}</TableCell>
      <TableCell align="right">{topHsp.evalue.toExponential(2)}</TableCell>
      <TableCell align="right">{identPct}%</TableCell>
      <TableCell>
        {topHsp.query_from}\u2013{topHsp.query_to}
      </TableCell>
      <TableCell>
        {topHsp.hit_from}\u2013{topHsp.hit_to}
      </TableCell>
      <TableCell>
        {desc ? (
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
        {hit.num}. {desc ? desc.accession : 'Unknown'} \u2014{' '}
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

// ── Main page ──────────────────────────────────────────────────────────

function BlastPage() {
  const user = useCurrentUser()
  const [assemblies, setAssemblies] = useState<Assembly[]>([])
  const [blastDbs, setBlastDbs] = useState<BlastDb[]>([])
  const [selectedAssembly, setSelectedAssembly] = useState(getInitialAssembly)
  const [program, setProgram] = useState('blastn')
  const [database, setDatabase] = useState('nt')
  const [query, setQuery] = useState('')
  const [loadError, setLoadError] = useState<string>()
  const blast = useBlastSearch()

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

  const loadBlastDbs = useCallback(async () => {
    try {
      const url = selectedAssembly
        ? `/blast/databases?assembly=${selectedAssembly}`
        : '/blast/databases'
      const data = await fetchJson<BlastDb[]>(url)
      setBlastDbs(data)
    } catch (error_) {
      const msg = error_ instanceof Error ? error_.message : String(error_)
      console.error('Failed to load BLAST databases', error_)
      setLoadError(msg)
    }
  }, [selectedAssembly])

  useEffect(() => {
    void loadAssemblies()
  }, [loadAssemblies])

  useEffect(() => {
    void loadBlastDbs()
  }, [loadBlastDbs])

  const availableDatabases = NCBI_DATABASES[program] ?? []
  const hits = blast.results
    ? blast.results.report.results.search.hits
    : undefined
  const isProteinResult = PROTEIN_PROGRAMS.has(blast.program ?? '')
  const canSubmit =
    user?.role === 'admin' || user?.role === 'user'

  return (
    <Nav>
      <Container maxWidth="lg">
        <Typography variant="h4" sx={{ mb: 3 }}>
          NCBI BLAST Search
        </Typography>

        {loadError ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {loadError}
          </Alert>
        ) : null}

        {blast.error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {blast.error}
          </Alert>
        ) : null}

        {canSubmit ? null : (
          <Alert severity="info" sx={{ mb: 2 }}>
            BLAST search requires a logged-in user account. Guest and read-only
            users cannot submit searches.
          </Alert>
        )}

        {blastDbs.length > 0 ? (
          <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Configured BLAST databases
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {blastDbs.map((db) => (
                <Button
                  key={db._id}
                  variant="outlined"
                  size="small"
                  onClick={() => {
                    setProgram(db.program)
                    setDatabase(db.database)
                  }}
                >
                  {db.name} ({db.program}/{db.database})
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
                {NCBI_PROGRAMS.map((p) => (
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
            sx={{ mb: 2, fontFamily: 'monospace' }}
            slotProps={{ input: { sx: { fontFamily: 'monospace' } } }}
          />

          <Button
            variant="contained"
            disabled={blast.submitting || query.trim().length === 0 || !canSubmit}
            onClick={() => {
              blast.submit(program, database, query)
            }}
          >
            {blast.submitting ? 'Searching\u2026' : 'Search'}
          </Button>
        </Paper>

        {blast.submitting ? (
          <Paper variant="outlined" sx={{ p: 3, mb: 3, textAlign: 'center' }}>
            <CircularProgress size={24} sx={{ mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              BLAST search in progress\u2026 Job: {blast.jobId} \u2014 Status:{' '}
              {blast.status}
            </Typography>
            <LinearProgress sx={{ mt: 2 }} />
            <Button
              variant="outlined"
              color="error"
              size="small"
              sx={{ mt: 2 }}
              onClick={() => {
                blast.cancel()
              }}
            >
              Cancel
            </Button>
          </Paper>
        ) : null}

        {hits ? (
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
                    <TableCell>Scientific Name</TableCell>
                    <TableCell align="right">Score</TableCell>
                    <TableCell align="right">E-value</TableCell>
                    <TableCell align="right">Identity</TableCell>
                    <TableCell>Query Range</TableCell>
                    <TableCell>Hit Range</TableCell>
                    <TableCell>NCBI</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {hits.map((hit) => (
                    <HitRow
                      key={hit.num}
                      hit={hit}
                      isProteinResult={isProteinResult}
                    />
                  ))}
                  {hits.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={10}
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
        ) : null}

        {hits && hits.length > 0 ? (
          <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Alignment Details
            </Typography>
            {hits.slice(0, 20).map((hit) => (
              <HitAlignment key={hit.num} hit={hit} />
            ))}
          </Paper>
        ) : null}

        {user?.role === 'admin' ? (
          <AdminBlastDbPanel
            assemblies={assemblies}
            blastDbs={blastDbs}
            onChanged={() => {
              void loadBlastDbs()
            }}
          />
        ) : null}
      </Container>
    </Nav>
  )
}

// ── Admin panel ────────────────────────────────────────────────────────

function AdminBlastDbPanel({
  assemblies,
  blastDbs,
  onChanged,
}: {
  assemblies: Assembly[]
  blastDbs: BlastDb[]
  onChanged: () => void
}) {
  const [name, setName] = useState('')
  const [program, setProgram] = useState('blastn')
  const [database, setDatabase] = useState('nt')
  const [assemblyIds, setAssemblyIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [adminError, setAdminError] = useState<string>()

  const handleCreate = useCallback(async () => {
    setSaving(true)
    setAdminError(undefined)
    try {
      const res = await fetch('/blast/databases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, program, database, assemblyIds }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`${res.status}: ${text}`)
      }
      setName('')
      setAssemblyIds([])
      onChanged()
    } catch (error_) {
      setAdminError(error_ instanceof Error ? error_.message : String(error_))
    }
    setSaving(false)
  }, [name, program, database, assemblyIds, onChanged])

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/blast/databases/${id}`, { method: 'DELETE' })
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

  const availableDatabases = NCBI_DATABASES[program] ?? []

  return (
    <>
      <Divider sx={{ my: 4 }} />
      <Typography variant="h5" sx={{ mb: 2 }}>
        Admin: Configure BLAST Databases
      </Typography>

      {adminError ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {adminError}
        </Alert>
      ) : null}

      {blastDbs.length > 0 ? (
        <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Program</TableCell>
                <TableCell>Database</TableCell>
                <TableCell>Assemblies</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {blastDbs.map((db) => (
                <TableRow key={db._id} hover>
                  <TableCell>{db.name}</TableCell>
                  <TableCell>{db.program}</TableCell>
                  <TableCell>{db.database}</TableCell>
                  <TableCell>
                    {db.assemblyIds.map((id) => (
                      <AssemblyChip
                        key={id}
                        id={id}
                        assemblies={assemblies}
                      />
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
                      \u2715
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
          Add BLAST Database
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
          <TextField
            label="Name"
            size="small"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
            }}
            sx={{ minWidth: 200 }}
          />
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Program</InputLabel>
            <Select
              value={program}
              label="Program"
              onChange={(e) => {
                setProgram(e.target.value)
                setDatabase(getFirstDbValue(e.target.value))
              }}
            >
              {NCBI_PROGRAMS.map((p) => (
                <MenuItem key={p.value} value={p.value}>
                  {p.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 200 }}>
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
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Assemblies</InputLabel>
            <Select
              multiple
              value={assemblyIds}
              label="Assemblies"
              onChange={(e) => {
                const val = e.target.value
                setAssemblyIds(typeof val === 'string' ? val.split(',') : val)
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
          disabled={saving || name.trim().length === 0}
          onClick={() => {
            void handleCreate()
          }}
        >
          Add Database
        </Button>
      </Paper>
    </>
  )
}

const root = document.querySelector('#root')
if (root) {
  createRoot(root).render(<BlastPage />)
}
