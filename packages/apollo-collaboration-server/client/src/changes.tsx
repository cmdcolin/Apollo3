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

interface ChangeRow {
  _id: string
  sequence?: number
  typeName: string
  user: string
  changedIds?: string[]
  createdAt?: string
}

interface GeneHistoryResponse {
  changes: ChangeRow[]
  total: number
  page: number
  limit: number
}

type ChangeGridRow = ChangeRow & { id: string }

const columns: GridColDef<ChangeGridRow>[] = [
  { field: 'sequence', headerName: 'Sequence', width: 100 },
  { field: 'typeName', headerName: 'Type', flex: 1 },
  { field: 'user', headerName: 'User', flex: 1 },
  {
    field: 'changedIds',
    headerName: 'Changed IDs',
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

function clearGeneIdParam() {
  const url = new URL(globalThis.location.href)
  url.searchParams.delete('geneId')
  globalThis.history.replaceState(null, '', url.toString())
}

function RecentChangesPage() {
  const params = new URLSearchParams(globalThis.location.search)
  const initialGeneId = params.get('geneId') ?? ''

  const [changes, setChanges] = useState<ChangeRow[]>([])
  const [total, setTotal] = useState<number>()
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
      const page = paginationModel.page + 1
      const limit = paginationModel.pageSize
      if (activeGeneId) {
        const data = await fetchJson<GeneHistoryResponse>(
          `/changes/gene/${encodeURIComponent(activeGeneId)}?limit=${limit}&page=${page}`,
        )
        setChanges(data.changes)
        setTotal(data.total)
      } else {
        const data = await fetchJson<ChangeRow[]>(
          `/changes/recent?limit=${limit}&page=${page}`,
        )
        setChanges(data)
        setTotal(undefined)
      }
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_))
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

  // For recent changes where total is unknown, estimate rowCount so DataGrid
  // shows a "next" button only when the current page is full.
  const unknownRowCount =
    changes.length >= paginationModel.pageSize
      ? (paginationModel.page + 2) * paginationModel.pageSize
      : paginationModel.page * paginationModel.pageSize + changes.length
  const rowCount = total ?? unknownRowCount

  return (
    <Nav current="changes">
      <Container>
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
          <DataGrid
            rows={changes.map((c) => ({ ...c, id: c._id }))}
            columns={columns}
            density="compact"
            paginationMode="server"
            rowCount={rowCount}
            paginationModel={paginationModel}
            onPaginationModelChange={setPaginationModel}
            pageSizeOptions={[25, 50, 100]}
          />
        </Box>
      </Container>
    </Nav>
  )
}

const root = document.querySelector('#root')
if (root) {
  createRoot(root).render(<RecentChangesPage />)
}
