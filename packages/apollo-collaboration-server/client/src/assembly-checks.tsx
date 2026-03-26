import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import Container from '@mui/material/Container'
import FormControlLabel from '@mui/material/FormControlLabel'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { Nav } from './Nav.js'
import { fetchJson } from './fetchUtil.js'

interface Assembly {
  _id: string
  name: string
  displayName?: string
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

function getAssemblyId() {
  const parts = globalThis.location.pathname.split('/').filter(Boolean)
  if (
    parts.length >= 3 &&
    parts[0] === 'ui' &&
    parts[1] === 'assembly-checks'
  ) {
    return parts[2]
  }
}

type CheckResultRow = CheckResult & { id: string }

const columns: GridColDef<CheckResultRow>[] = [
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

function AssemblyChecksPage() {
  const assemblyId = getAssemblyId()
  const [assembly, setAssembly] = useState<Assembly>()
  const [currentUser, setCurrentUser] = useState<User>()
  const [checkTypes, setCheckTypes] = useState<CheckType[]>([])
  const [checkResults, setCheckResults] = useState<CheckResult[]>([])
  const [enabledChecks, setEnabledChecks] = useState<string[]>([])
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!assemblyId) {
      setError('No assembly ID in URL')
      return
    }
    try {
      setError(undefined)
      const [assemblyData, userData, types, results] = await Promise.all([
        fetchJson<Assembly>(`/assemblies/${assemblyId}`),
        fetchJson<User>('/users/me').catch(() => null),
        fetchJson<CheckType[]>('/checks/types').catch(() => [] as CheckType[]),
        fetchJson<CheckResult[]>(`/checks?assembly=${assemblyId}`).catch(
          () => [] as CheckResult[],
        ),
      ])
      setAssembly(assemblyData)
      if (userData) {
        setCurrentUser(userData)
      }
      setEnabledChecks(assemblyData.checks ?? [])
      setCheckTypes(types)
      setCheckResults(results)
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_))
    }
  }, [assemblyId])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSaveChecks() {
    if (!assemblyId || !assembly) {
      return
    }
    try {
      setSaving(true)
      setError(undefined)
      const res = await fetch(`/assemblies/${assemblyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checks: enabledChecks }),
      })
      if (!res.ok) {
        throw new Error(`Failed: ${res.status}`)
      }
      setAssembly({ ...assembly, checks: enabledChecks })
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_))
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

  const isAdmin = currentUser?.role === 'admin'
  const displayName = assembly?.displayName ?? assembly?.name ?? assemblyId

  return (
    <Nav current="assemblies">
      <Container>
        <Breadcrumbs sx={{ mb: 2 }}>
          <Link underline="hover" color="inherit" href="/ui/assemblies/">
            Assemblies
          </Link>
          <Link
            underline="hover"
            color="inherit"
            href={`/ui/assemblies/${assemblyId}`}
          >
            {displayName}
          </Link>
          <Typography color="text.primary">Checks</Typography>
        </Breadcrumbs>

        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}

        <Typography variant="h4" sx={{ mb: 2 }}>
          Checks — {displayName}
        </Typography>

        {isAdmin && checkTypes.length > 0 ? (
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
          Check Results ({checkResults.length})
        </Typography>
        <Box sx={{ height: 500 }}>
          <DataGrid
            rows={checkResults.map((r) => ({ ...r, id: r._id }))}
            columns={columns}
            density="compact"
            pageSizeOptions={[25, 50, 100]}
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          />
        </Box>
      </Container>
    </Nav>
  )
}

const root = document.querySelector('#root')
if (root) {
  createRoot(root).render(<AssemblyChecksPage />)
}
