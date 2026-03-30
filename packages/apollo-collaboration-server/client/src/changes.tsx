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
  featureCount: number
  changeTypes: string[]
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

// --- Gene history (per-record with diffs) ---

interface FieldDiff {
  field: string
  from: unknown
  to: unknown
}

interface GeneHistoryRow {
  _id: string
  sequence?: number
  featureId: string
  featureType: string
  changeType: string
  user: string
  createdAt?: string
  diffs?: FieldDiff[]
}

function formatDiffs(diffs: FieldDiff[] | undefined) {
  if (!diffs || diffs.length === 0) {
    return null
  }
  return diffs
    .map((d) => `${d.field}: ${String(d.from)} \u2192 ${String(d.to)}`)
    .join(', ')
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
  { field: 'featureType', headerName: 'Feature Type', width: 120 },
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
  {
    field: 'diffs',
    headerName: 'Changes',
    flex: 2,
    renderCell: (params) => {
      const text = formatDiffs(params.value as FieldDiff[] | undefined)
      if (!text) {
        return null
      }
      return (
        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
          {text}
        </Typography>
      )
    },
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

// --- Shared types ---

interface PaginatedResponse<T> {
  changes: T[]
  total: number
  page: number
  limit: number
}

function clearGeneIdParam() {
  const url = new URL(globalThis.location.href)
  url.searchParams.delete('geneId')
  globalThis.history.replaceState(null, '', url.toString())
}

function RecentChangesPage() {
  const params = new URLSearchParams(globalThis.location.search)
  const initialGeneId = params.get('geneId') ?? ''

  const [recentChanges, setRecentChanges] = useState<RecentChangeRow[]>([])
  const [geneHistory, setGeneHistory] = useState<GeneHistoryRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [geneIdInput, setGeneIdInput] = useState(initialGeneId)
  const [activeGeneId, setActiveGeneId] = useState(initialGeneId)
  const [paginationModel, setPaginationModel] = useState({
    page: 0,
    pageSize: 25,
  })

  const load = useCallback(async () => {
    try {
      setError(undefined)
      setLoading(true)
      const page = paginationModel.page + 1
      const limit = paginationModel.pageSize
      if (activeGeneId) {
        const data = await fetchJson<PaginatedResponse<GeneHistoryRow>>(
          `/changes/gene/${encodeURIComponent(activeGeneId)}?limit=${limit}&page=${page}`,
        )
        setGeneHistory(data.changes)
        setRecentChanges([])
        setTotal(data.total)
      } else {
        const data = await fetchJson<PaginatedResponse<RecentChangeRow>>(
          `/changes/recent?limit=${limit}&page=${page}`,
        )
        setRecentChanges(data.changes)
        setGeneHistory([])
        setTotal(data.total)
      }
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_))
    } finally {
      setLoading(false)
    }
  }, [paginationModel.page, paginationModel.pageSize, activeGeneId])

  useEffect(() => {
    void load()
  }, [load])

  function clearFilter() {
    setGeneIdInput('')
    setActiveGeneId('')
    setPaginationModel((m) => ({ ...m, page: 0 }))
    clearGeneIdParam()
  }

  return (
    <Nav current="changes">
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
            setPaginationModel((m) => ({ ...m, page: 0 }))
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
              rows={geneHistory.map((c) => ({ ...c, id: c._id }))}
              columns={geneHistoryColumns}
              density="compact"
              loading={loading}
              paginationMode="server"
              rowCount={total}
              paginationModel={paginationModel}
              onPaginationModelChange={setPaginationModel}
              pageSizeOptions={[25, 50, 100]}
            />
          ) : (
            <DataGrid
              rows={recentChanges.map((c) => ({ ...c, id: c._id }))}
              columns={recentColumns}
              density="compact"
              loading={loading}
              paginationMode="server"
              rowCount={total}
              paginationModel={paginationModel}
              onPaginationModelChange={setPaginationModel}
              pageSizeOptions={[25, 50, 100]}
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
