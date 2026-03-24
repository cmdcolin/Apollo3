import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import FormControl from '@mui/material/FormControl'
import IconButton from '@mui/material/IconButton'
import InputLabel from '@mui/material/InputLabel'
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
import { useCallback, useState } from 'react'

import { AssemblyChip } from '../helpers/index.js'
import { BLAST_PROGRAMS, TAB_TOOLS, TOOL_LABELS } from '../types.js'
import type { AnalysisDb, Assembly } from '../types.js'

export function AdminDatabasePanel({
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
                      label={TOOL_LABELS[db.tool] ?? db.tool}
                      size="small"
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
          Build Database
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Extract sequences from an assembly and build a searchable database.
          Requires the selected tool to be installed on the server. BLAT and
          isPCR databases use the same .2bit format — a BLAT database can be
          used for isPCR searches without building a separate one.
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
              {TAB_TOOLS.map((eng) => (
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
          {building ? 'Building…' : 'Build Database'}
        </Button>
      </Paper>
    </>
  )
}
