import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Container from '@mui/material/Container'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { Nav } from './Nav.js'
import { fetchJson } from './fetchUtil.js'

// --- Recent changes (grouped by operation) ---

interface RecentChangeRow {
  _id: string
  sequence?: number
  user: string
  createdAt?: string
  assembly?: string
  summary: string
  featureIds: string[]
}

const recentColumns: GridColDef<RecentChangeRow & { id: string }>[] = [
  { field: 'sequence', headerName: 'Seq', width: 80 },
  { field: 'summary', headerName: 'Summary', flex: 2 },
  { field: 'user', headerName: 'User', flex: 1 },
  { field: 'assembly', headerName: 'Assembly', flex: 1 },
  {
    field: 'featureIds',
    headerName: 'Features',
    flex: 1.5,
    renderCell: (params) => {
      const ids = (params.value as string[] | undefined) ?? []
      return (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {ids.slice(0, 3).map((id) => (
            <Chip
              key={id}
              label={id}
              size="small"
              variant="outlined"
              component="a"
              href={`/ui/changes/?geneId=${encodeURIComponent(id)}`}
              clickable
              sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
            />
          ))}
          {ids.length > 3 && (
            <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
              +{ids.length - 3} more
            </Typography>
          )}
        </Box>
      )
    },
  },
  {
    field: 'createdAt',
    headerName: 'Date',
    flex: 1,
    renderCell: (params) =>
      params.value ? new Date(params.value as string).toLocaleString() : '',
  },
]

// --- Gene history (per-record) ---

interface GeneHistoryRow {
  _id: string
  sequence?: number
  featureId: string
  featureType: string
  changeType: string
  user: string
  createdAt?: string
  min: number
  max: number
  strand?: number | null
}

const geneHistoryColumns: GridColDef<GeneHistoryRow & { id: string }>[] = [
  { field: 'sequence', headerName: 'Seq', width: 80 },
  {
    field: 'changeType',
    headerName: 'Action',
    width: 90,
    renderCell: (params) => {
      const colorMap: Record<string, 'success' | 'info' | 'error'> = {
        insert: 'success',
        update: 'info',
        delete: 'error',
      }
      return (
        <Chip
          label={params.value as string}
          size="small"
          color={colorMap[params.value as string] ?? 'default'}
          variant="outlined"
        />
      )
    },
  },
  { field: 'featureType', headerName: 'Type', width: 100 },
  {
    field: 'featureId',
    headerName: 'Feature ID',
    flex: 1,
    renderCell: (params) => (
      <Typography
        variant="body2"
        sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
      >
        {params.value as string}
      </Typography>
    ),
  },
  { field: 'min', headerName: 'Start', width: 100 },
  { field: 'max', headerName: 'End', width: 100 },
  {
    field: 'strand',
    headerName: 'Strand',
    width: 80,
    valueFormatter: (value: number | null | undefined) =>
      value === 1 ? '+' : value === -1 ? '-' : '',
  },
  { field: 'user', headerName: 'User', flex: 1 },
  {
    field: 'createdAt',
    headerName: 'Date',
    flex: 1,
    renderCell: (params) =>
      params.value ? new Date(params.value as string).toLocaleString() : '',
  },
]

function clearGeneIdParam() {
  const url = new URL(globalThis.location.href)
  url.searchParams.delete('geneId')
  globalThis.history.replaceState(null, '', url.toString())
}

function RecentChangesPage() {
  const params = new URLSearchParams(globalThis.location.search)
  const initialGeneId = params.get('geneId') ?? ''

  const [rows, setRows] = useState<(RecentChangeRow | GeneHistoryRow)[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [geneIdInput, setGeneIdInput] = useState(initialGeneId)
  const [activeGeneId, setActiveGeneId] = useState(initialGeneId)

  const load = useCallback(async () => {
    try {
      setError(undefined)
      setLoading(true)
      const endpoint = activeGeneId
        ? `/changes/gene/${encodeURIComponent(activeGeneId)}`
        : '/changes/recent'
      const data = await fetchJson<{ changes: (RecentChangeRow | GeneHistoryRow)[] }>(endpoint)
      setRows(data.changes)
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_))
    } finally {
      setLoading(false)
    }
  }, [activeGeneId])

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    load()
  }, [load])

  function clearFilter() {
    setGeneIdInput('')
    setActiveGeneId('')
    clearGeneIdParam()
  }

  return (
    <Nav current="changes" requireAuth>
      <Container maxWidth="xl">
        <Typography variant="h4" gutterBottom>
          {activeGeneId ? 'Gene History' : 'Recent Changes'}
        </Typography>

        <Box
          component="form"
          sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center' }}
          onSubmit={(e) => {
            e.preventDefault()
            const trimmed = geneIdInput.trim()
            setActiveGeneId(trimmed)
            if (trimmed) {
              const url = new URL(globalThis.location.href)
              url.searchParams.set('geneId', trimmed)
              globalThis.history.replaceState(null, '', url.toString())
            } else {
              clearGeneIdParam()
            }
          }}
        >
          <TextField
            size="small"
            label="Gene / Feature ID"
            placeholder="Paste a feature ID to view its history"
            value={geneIdInput}
            onChange={(e) => {
              setGeneIdInput(e.target.value)
            }}
            sx={{ width: 360 }}
          />
          <Button type="submit" variant="contained" size="small">
            Search
          </Button>
          {activeGeneId && (
            <Button size="small" onClick={clearFilter}>
              Clear
            </Button>
          )}
        </Box>

        {activeGeneId && (
          <Box sx={{ mb: 2 }}>
            <Chip
              label={`Gene: ${activeGeneId}`}
              onDelete={clearFilter}
              color="primary"
              variant="outlined"
            />
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ height: 600 }}>
          {activeGeneId ? (
            <DataGrid
              rows={(rows as GeneHistoryRow[]).map((c) => ({ ...c, id: c._id }))}
              columns={geneHistoryColumns}
              density="compact"
              loading={loading}
            />
          ) : (
            <DataGrid
              rows={(rows as RecentChangeRow[]).map((c) => ({ ...c, id: c._id }))}
              columns={recentColumns}
              density="compact"
              loading={loading}
            />
          )}
        </Box>
      </Container>
    </Nav>
  )
}

const root = document.querySelector('#root')
if (root) {
  createRoot(root).render(<RecentChangesPage />)
}
