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
import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { Nav } from './Nav.js'
import { fetchJson } from './fetchUtil.js'

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

interface BlastHit {
  description: { accession: string; sciname: string; title: string }[]
  hsps: {
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
  }[]
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

const NCBI_PROGRAMS = [
  { value: 'blastn', label: 'blastn (nucleotide → nucleotide)' },
  { value: 'blastp', label: 'blastp (protein → protein)' },
  { value: 'blastx', label: 'blastx (translated nucl → protein)' },
  { value: 'tblastn', label: 'tblastn (protein → translated nucl)' },
  { value: 'tblastx', label: 'tblastx (translated nucl → translated nucl)' },
]

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

interface UserInfo {
  username: string
  email: string
  role: string
}

function useCurrentUser() {
  const [user, setUser] = useState<UserInfo>()

  useEffect(() => {
    fetch('/users/me', { headers: { Accept: 'application/json' } })
      .then((r) => {
        if (r.ok) {
          return r.json()
        }
        return null
      })
      .then((data) => {
        if (data) {
          setUser(data as UserInfo)
        }
      })
      .catch(() => {})
  }, [])

  return user
}

function getInitialAssembly() {
  const params = new URLSearchParams(globalThis.location.search)
  return params.get('assembly') ?? ''
}

function BlastPage() {
  const user = useCurrentUser()
  const [assemblies, setAssemblies] = useState<Assembly[]>([])
  const [blastDbs, setBlastDbs] = useState<BlastDb[]>([])
  const [selectedAssembly, setSelectedAssembly] = useState(getInitialAssembly)
  const [program, setProgram] = useState('blastn')
  const [database, setDatabase] = useState('nt')
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string>()
  const [submitting, setSubmitting] = useState(false)
  const [rid, setRid] = useState<string>()
  const [status, setStatus] = useState<string>()
  const [results, setResults] = useState<BlastSearchResult>()
  const pollRef = useRef<ReturnType<typeof setInterval>>()

  const loadAssemblies = useCallback(async () => {
    try {
      const data = await fetchJson<Assembly[]>('/assemblies')
      setAssemblies(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const loadBlastDbs = useCallback(async () => {
    try {
      const url = selectedAssembly
        ? `/blast/databases?assembly=${selectedAssembly}`
        : '/blast/databases'
      const data = await fetchJson<BlastDb[]>(url)
      setBlastDbs(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [selectedAssembly])

  useEffect(() => {
    void loadAssemblies()
  }, [loadAssemblies])

  useEffect(() => {
    void loadBlastDbs()
  }, [loadBlastDbs])

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
      }
    }
  }, [])

  const handleSubmit = useCallback(async () => {
    setSubmitting(true)
    setError(undefined)
    setResults(undefined)
    setStatus(undefined)
    setRid(undefined)

    try {
      const response = await fetch('/blast/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ program, database, query }),
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(`${response.status}: ${text}`)
      }
      const data = (await response.json()) as { rid: string; rtoe: number }
      setRid(data.rid)
      setStatus('WAITING')

      const pollDelay = Math.max(data.rtoe * 1000, 5000)
      pollRef.current = setInterval(async () => {
        try {
          const statusData = await fetchJson<{ rid: string; status: string }>(
            `/blast/status/${data.rid}`,
          )
          setStatus(statusData.status)

          if (statusData.status === 'READY') {
            if (pollRef.current) {
              clearInterval(pollRef.current)
            }
            const resultData = await fetchJson<BlastSearchResult>(
              `/blast/results/${data.rid}`,
            )
            setResults(resultData)
            setSubmitting(false)
          } else if (statusData.status === 'FAILED') {
            if (pollRef.current) {
              clearInterval(pollRef.current)
            }
            setError('BLAST search failed at NCBI')
            setSubmitting(false)
          }
        } catch (err) {
          if (pollRef.current) {
            clearInterval(pollRef.current)
          }
          setError(err instanceof Error ? err.message : String(err))
          setSubmitting(false)
        }
      }, pollDelay)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSubmitting(false)
    }
  }, [program, database, query])

  const handleSelectConfiguredDb = useCallback(
    (db: BlastDb) => {
      setProgram(db.program)
      setDatabase(db.database)
    },
    [],
  )

  const availableDatabases = NCBI_DATABASES[program] ?? []

  const hits = results?.report?.results?.search?.hits

  return (
    <Nav>
      <Container maxWidth="lg">
        <Typography variant="h4" sx={{ mb: 3 }}>
          NCBI BLAST Search
        </Typography>

        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}

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
                    handleSelectConfiguredDb(db)
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
                  const dbs = NCBI_DATABASES[e.target.value]
                  if (dbs && dbs.length > 0) {
                    setDatabase(dbs[0].value)
                  }
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
            disabled={submitting || query.trim().length === 0}
            onClick={() => {
              void handleSubmit()
            }}
          >
            {submitting ? 'Searching…' : 'Search'}
          </Button>
        </Paper>

        {submitting ? (
          <Paper variant="outlined" sx={{ p: 3, mb: 3, textAlign: 'center' }}>
            <CircularProgress size={24} sx={{ mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              BLAST search in progress… RID: {rid} — Status: {status}
            </Typography>
            <LinearProgress sx={{ mt: 2 }} />
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
                  {hits.map((hit) => {
                    const desc = hit.description[0]
                    const topHsp = hit.hsps[0]
                    const identPct =
                      topHsp.align_len > 0
                        ? ((topHsp.identity / topHsp.align_len) * 100).toFixed(
                            1,
                          )
                        : '—'

                    return (
                      <TableRow key={hit.num} hover>
                        <TableCell>{hit.num}</TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                          >
                            {desc?.accession}
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
                          {desc?.title}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
                            {desc?.sciname}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          {topHsp.bit_score.toFixed(1)}
                        </TableCell>
                        <TableCell align="right">
                          {topHsp.evalue.toExponential(2)}
                        </TableCell>
                        <TableCell align="right">{identPct}%</TableCell>
                        <TableCell>
                          {topHsp.query_from}–{topHsp.query_to}
                        </TableCell>
                        <TableCell>
                          {topHsp.hit_from}–{topHsp.hit_to}
                        </TableCell>
                        <TableCell>
                          {desc?.accession ? (
                            <Link
                              href={`https://www.ncbi.nlm.nih.gov/protein/${desc.accession}`}
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
                  })}
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

        {hits ? (
          <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Alignment Details
            </Typography>
            {hits.slice(0, 20).map((hit) => {
              const desc = hit.description[0]
              return (
                <Box key={hit.num} sx={{ mb: 3 }}>
                  <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                    {hit.num}. {desc?.accession} — {desc?.title}
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
            })}
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
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : String(err))
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
      } catch (err) {
        setAdminError(err instanceof Error ? err.message : String(err))
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
                    {db.assemblyIds.map((id) => {
                      const asm = assemblies.find((a) => a._id === id)
                      return (
                        <Chip
                          key={id}
                          label={asm?.displayName ?? asm?.name ?? id}
                          size="small"
                          sx={{ mr: 0.5 }}
                        />
                      )
                    })}
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
                      ✕
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
                const dbs = NCBI_DATABASES[e.target.value]
                if (dbs && dbs.length > 0) {
                  setDatabase(dbs[0].value)
                }
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
                    return asm?.displayName ?? asm?.name ?? id
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
