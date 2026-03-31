import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Container from '@mui/material/Container'
import FormControlLabel from '@mui/material/FormControlLabel'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import useSWR from 'swr'

import { Nav } from './Nav.js'
import { fetchJson } from './fetchUtil.js'

interface Assembly {
  _id: string
  name: string
  displayName: string
  checks?: string[]
}

interface User {
  _id: string
  role: string
}

interface CheckType {
  _id: string
  name: string
  isDefault: boolean
}

interface CheckResult {
  _id: string
  name: string
  cause: string
  featureId: string
  message: string
}

function getAssemblyName() {
  const parts = globalThis.location.pathname.split('/').filter(Boolean)
  if (
    parts.length >= 3 &&
    parts[0] === 'ui' &&
    parts[1] === 'assembly-checks'
  ) {
    return decodeURIComponent(parts[2])
  }
}

type CheckResultRow = CheckResult & { id: string }

const resultColumns: GridColDef<CheckResultRow>[] = [
  { field: 'name', headerName: 'Check', flex: 1 },
  { field: 'cause', headerName: 'Cause', flex: 1 },
  {
    field: 'featureId',
    headerName: 'Feature ID',
    flex: 1.5,
    renderCell: (params) => (
      <Typography
        variant="body2"
        sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
      >
        {params.value}
      </Typography>
    ),
  },
  { field: 'message', headerName: 'Message', flex: 2 },
]

const assemblyName = getAssemblyName()

function AssemblyChecksPage() {
  const encodedName = assemblyName
    ? encodeURIComponent(assemblyName)
    : undefined
  const {
    data: assembly,
    error: assemblyError,
    isLoading,
    mutate: mutateAssembly,
  } = useSWR<Assembly, unknown>(
    encodedName ? `/assemblies/by-name/${encodedName}` : null,
    fetchJson,
  )
  const { data: currentUser } = useSWR<User>('/users/me', fetchJson)
  const { data: checkTypes } = useSWR<CheckType[]>('/checks/types', fetchJson)
  const { data: checkResults } = useSWR<CheckResult[]>(
    assembly ? `/checks?assembly=${assembly._id}` : null,
    fetchJson,
  )

  const [enabledChecks, setEnabledChecks] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string>()

  useEffect(() => {
    if (assembly?.checks) {
      setEnabledChecks(assembly.checks)
    }
  }, [assembly?.checks])

  async function handleSaveChecks() {
    if (!assembly) {
      return
    }
    try {
      setSaving(true)
      setSaveError(undefined)
      const res = await fetch(`/assemblies/${assembly._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checks: enabledChecks }),
      })
      if (!res.ok) {
        throw new Error(`Failed: ${res.status}`)
      }
      await mutateAssembly({ ...assembly, checks: enabledChecks }, false)
    } catch (error_) {
      setSaveError(error_ instanceof Error ? error_.message : String(error_))
    } finally {
      setSaving(false)
    }
  }

  function handleToggleCheck(name: string, checked: boolean) {
    if (checked) {
      setEnabledChecks([...enabledChecks, name])
    } else {
      setEnabledChecks(enabledChecks.filter((c) => c !== name))
    }
  }

  if (!assemblyName) {
    return (
      <Nav current="assemblies" requireAuth>
        <Container>
          <Alert severity="error">No assembly name in URL</Alert>
        </Container>
      </Nav>
    )
  }

  if (assemblyError) {
    return (
      <Nav current="assemblies" requireAuth>
        <Container>
          <Alert severity="error">
            {assemblyError instanceof Error
              ? assemblyError.message
              : 'Unknown error'}
          </Alert>
        </Container>
      </Nav>
    )
  }

  if (isLoading || !assembly) {
    return (
      <Nav current="assemblies" requireAuth>
        <Container>
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
            <CircularProgress />
          </Box>
        </Container>
      </Nav>
    )
  }

  const isAdmin = currentUser?.role === 'admin'

  return (
    <Nav current="assemblies" requireAuth>
      <Container>
        <Breadcrumbs sx={{ mb: 2 }}>
          <Link underline="hover" color="inherit" href="/ui/assemblies/">
            Assemblies
          </Link>
          <Link
            underline="hover"
            color="inherit"
            href={`/ui/assemblies/${assemblyName}`}
          >
            {assembly.displayName}
          </Link>
          <Typography color="text.primary">Checks</Typography>
        </Breadcrumbs>

        {saveError ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {saveError}
          </Alert>
        ) : null}

        <Typography variant="h4" sx={{ mb: 2 }}>
          Checks — {assembly.displayName}
        </Typography>

        {isAdmin && checkTypes && checkTypes.length > 0 ? (
          <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Enabled Checks
            </Typography>
            {checkTypes.map((ct) => (
              <FormControlLabel
                key={ct._id}
                control={
                  <Checkbox
                    checked={enabledChecks.includes(ct.name)}
                    onChange={(_e, checked) => {
                      handleToggleCheck(ct.name, checked)
                    }}
                  />
                }
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {ct.name}
                    {ct.isDefault ? (
                      <Chip label="default" size="small" variant="outlined" />
                    ) : null}
                  </Box>
                }
              />
            ))}
            <Box sx={{ mt: 1 }}>
              <Button
                variant="contained"
                size="small"
                disabled={saving}
                onClick={() => {
                  void handleSaveChecks()
                }}
              >
                Save
              </Button>
            </Box>
          </Paper>
        ) : null}

        <Typography variant="h6" sx={{ mb: 1 }}>
          Check Results ({checkResults?.length ?? '...'})
        </Typography>
        <Box sx={{ height: 500 }}>
          {checkResults ? (
            <DataGrid
              rows={checkResults.map((r) => ({ ...r, id: r._id }))}
              columns={resultColumns}
              density="compact"
              pageSizeOptions={[25, 50, 100]}
              initialState={{
                pagination: { paginationModel: { pageSize: 25 } },
              }}
            />
          ) : (
            <CircularProgress size={24} />
          )}
        </Box>
      </Container>
    </Nav>
  )
}

const root = document.querySelector('#root')
if (root) {
  createRoot(root).render(<AssemblyChecksPage />)
}
