import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Select from '@mui/material/Select'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState } from 'react'

import { blastQueryLabel, getFirstNcbiDb } from '../helpers/index.js'
import type { SearchState } from '../hooks/useAnalysisSearch.js'
import {
  BLAST_PROGRAMS,
  BLAT_QUERY_TYPES,
  NCBI_DATABASES,
  TOOL_DESCRIPTIONS,
  TOOL_LABELS,
} from '../types.js'
import type { AnalysisDb, Assembly } from '../types.js'

export function LocalToolSearchTab({
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
  // isPCR can reuse BLAT .2bit databases
  const dbs = analysisDbs.filter(
    (db) =>
      (tool === 'ispcr'
        ? db.tool === 'ispcr' || db.tool === 'blat'
        : db.tool === tool) && db.status === 'ready',
  )
  const [selectedDb, setSelectedDb] = useState('')
  const [query, setQuery] = useState('')
  const [blatQueryType, setBlatQueryType] = useState('dna')
  const [forwardPrimer, setForwardPrimer] = useState('')
  const [reversePrimer, setReversePrimer] = useState('')
  const [maxSize, setMaxSize] = useState('4000')

  // NCBI link state (local-blast tab only)
  const [ncbiProgram, setNcbiProgram] = useState('blastn')
  const [ncbiDatabase, setNcbiDatabase] = useState('nt')

  const selectedDbConfig = dbs.find((d) => d._id === selectedDb)
  const description = TOOL_DESCRIPTIONS[tool] ?? ''

  function queryLabel() {
    if (tool === 'miniprot') {
      return 'Protein sequence (FASTA or plain)'
    }
    if (tool === 'blat' && blatQueryType === 'protein') {
      return 'Protein sequence (FASTA or plain)'
    }
    if (tool === 'local-blast') {
      return blastQueryLabel(String(selectedDbConfig?.params?.program ?? ''))
    }
    return 'Query sequence (FASTA or plain)'
  }

  function handleSubmit() {
    if (!selectedDbConfig) {
      return
    }
    const assemblyId = selectedDbConfig.assemblyIds[0]

    if (tool === 'ispcr') {
      search.submit(
        'ispcr',
        {
          forwardPrimer,
          reversePrimer,
          maxSize: Number(maxSize),
          databaseId: selectedDb,
        },
        assemblyId,
      )
      return
    }

    const jobParams: Record<string, unknown> = { query, databaseId: selectedDb }
    if (selectedDbConfig.params.program) {
      jobParams.program = selectedDbConfig.params.program
    }
    if (tool === 'blat') {
      jobParams.queryType = blatQueryType
    }
    search.submit(tool, jobParams, assemblyId)
  }

  function isSubmitDisabled() {
    if (search.submitting || !selectedDb || !canSubmit) {
      return true
    }
    if (tool === 'ispcr') {
      return (
        forwardPrimer.trim().length === 0 || reversePrimer.trim().length === 0
      )
    }
    return query.trim().length === 0
  }

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
          {tool === 'ispcr' ? ' isPCR can also use BLAT databases.' : ''}
        </Alert>
      ) : (
        <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
          <Box
            sx={{
              display: 'flex',
              gap: 2,
              mb: 2,
              flexWrap: 'wrap',
              alignItems: 'flex-end',
            }}
          >
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
                      {extra} — {asmName}
                    </MenuItem>
                  )
                })}
              </Select>
            </FormControl>

            {tool === 'blat' ? (
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>Query type</InputLabel>
                <Select
                  value={blatQueryType}
                  label="Query type"
                  onChange={(e) => {
                    setBlatQueryType(e.target.value)
                  }}
                >
                  {BLAT_QUERY_TYPES.map((qt) => (
                    <MenuItem key={qt.value} value={qt.value}>
                      {qt.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            ) : null}
          </Box>

          {tool === 'ispcr' ? (
            <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
              <TextField
                label="Forward primer (5′→3′)"
                size="small"
                value={forwardPrimer}
                onChange={(e) => {
                  setForwardPrimer(e.target.value)
                }}
                sx={{ minWidth: 220 }}
                slotProps={{ input: { sx: { fontFamily: 'monospace' } } }}
              />
              <TextField
                label="Reverse primer (5′→3′)"
                size="small"
                value={reversePrimer}
                onChange={(e) => {
                  setReversePrimer(e.target.value)
                }}
                sx={{ minWidth: 220 }}
                slotProps={{ input: { sx: { fontFamily: 'monospace' } } }}
              />
              <TextField
                label="Max product size (bp)"
                size="small"
                type="number"
                value={maxSize}
                onChange={(e) => {
                  setMaxSize(e.target.value)
                }}
                sx={{ width: 160 }}
              />
            </Box>
          ) : (
            <TextField
              label={queryLabel()}
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
          )}

          <Button
            variant="contained"
            disabled={isSubmitDisabled()}
            onClick={handleSubmit}
            sx={{ mt: tool === 'ispcr' ? 1 : 0 }}
          >
            {search.submitting ? 'Searching…' : 'Search'}
          </Button>
        </Paper>
      )}

      {tool === 'local-blast' ? (
        <NcbiBlastLink
          query={query}
          program={ncbiProgram}
          database={ncbiDatabase}
          setProgram={setNcbiProgram}
          setDatabase={setNcbiDatabase}
        />
      ) : null}
    </Box>
  )
}

function NcbiBlastLink({
  query,
  program,
  database,
  setProgram,
  setDatabase,
}: {
  query: string
  program: string
  database: string
  setProgram: (v: string) => void
  setDatabase: (v: string) => void
}) {
  const availableDatabases = NCBI_DATABASES[program] ?? []

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
        Search NCBI BLAST instead
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Opens blast.ncbi.nlm.nih.gov with your sequence pre-filled.
      </Typography>

      <Box
        component="form"
        action="https://blast.ncbi.nlm.nih.gov/blast/Blast.cgi"
        method="POST"
        target="_blank"
        rel="noopener noreferrer"
        sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-end' }}
      >
        <input type="hidden" name="PAGE_TYPE" value="BlastSearch" />
        <input type="hidden" name="PROGRAM" value={program} />
        <input type="hidden" name="DATABASE" value={database} />
        <input type="hidden" name="QUERY" value={query} />

        <FormControl size="small" sx={{ minWidth: 260 }}>
          <InputLabel>Program</InputLabel>
          <Select
            value={program}
            label="Program"
            onChange={(e) => {
              setProgram(e.target.value)
              setDatabase(getFirstNcbiDb(NCBI_DATABASES, e.target.value))
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

        <Button type="submit" variant="outlined" size="small">
          Open in NCBI BLAST ↗
        </Button>
      </Box>
    </Paper>
  )
}
