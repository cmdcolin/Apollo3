import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Container from '@mui/material/Container'
import Paper from '@mui/material/Paper'
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

interface ChangeRow {
  _id: string
  sequence?: number
  typeName: string
  user: string
  assembly?: string
  changedIds?: string[]
  createdAt?: string
}

interface GeneHistoryResponse {
  changes: ChangeRow[]
  total: number
  page: number
  limit: number
}

function ChangeTable({ changes }: { changes: ChangeRow[] }) {
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Sequence</TableCell>
            <TableCell>Type</TableCell>
            <TableCell>User</TableCell>
            <TableCell>Assembly</TableCell>
            <TableCell>Changed IDs</TableCell>
            <TableCell>Date</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {changes.map((c) => {
            const ids = c.changedIds ?? []
            const idsDisplay =
              ids.slice(0, 3).join(', ') + (ids.length > 3 ? '...' : '')
            const date = c.createdAt
              ? new Date(c.createdAt).toLocaleString()
              : ''
            return (
              <TableRow key={c._id} hover>
                <TableCell>{c.sequence ?? ''}</TableCell>
                <TableCell>{c.typeName}</TableCell>
                <TableCell>{c.user}</TableCell>
                <TableCell>{c.assembly ?? ''}</TableCell>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                  {idsDisplay}
                </TableCell>
                <TableCell>{date}</TableCell>
              </TableRow>
            )
          })}
          {changes.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={6}
                align="center"
                sx={{ color: 'text.secondary' }}
              >
                No changes found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

function Pagination({
  page,
  setPage,
  hasMore,
  total,
}: {
  page: number
  setPage: (p: number) => void
  hasMore: boolean
  total?: number
}) {
  return (
    <Box sx={{ display: 'flex', gap: 1, mt: 2, alignItems: 'center' }}>
      <Button
        size="small"
        disabled={page <= 1}
        onClick={() => {
          setPage(page - 1)
        }}
      >
        Previous
      </Button>
      <Typography variant="body2">Page {page}</Typography>
      <Button
        size="small"
        disabled={!hasMore}
        onClick={() => {
          setPage(page + 1)
        }}
      >
        Next
      </Button>
      {total !== undefined && (
        <Typography variant="body2" color="text.secondary">
          ({total} total)
        </Typography>
      )}
    </Box>
  )
}

function clearGeneIdParam() {
  const url = new URL(globalThis.location.href)
  url.searchParams.delete('geneId')
  globalThis.history.replaceState(null, '', url.toString())
}

function RecentChangesPage() {
  const params = new URLSearchParams(globalThis.location.search)
  const initialGeneId = params.get('geneId') ?? ''

  const [changes, setChanges] = useState<ChangeRow[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState<number>()
  const [error, setError] = useState<string>()
  const [geneIdInput, setGeneIdInput] = useState(initialGeneId)
  const [activeGeneId, setActiveGeneId] = useState(initialGeneId)
  const pageSize = 25

  const load = useCallback(async () => {
    try {
      setError(undefined)
      if (activeGeneId) {
        const data = await fetchJson<GeneHistoryResponse>(
          `/changes/gene/${encodeURIComponent(activeGeneId)}?limit=${pageSize}&page=${page}`,
        )
        setChanges(data.changes)
        setTotal(data.total)
      } else {
        const data = await fetchJson<ChangeRow[]>(
          `/changes/recent?limit=${pageSize}&page=${page}`,
        )
        setChanges(data)
        setTotal(undefined)
      }
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_))
    }
  }, [page, activeGeneId])

  useEffect(() => {
    void load()
  }, [load])

  function clearFilter() {
    setGeneIdInput('')
    setActiveGeneId('')
    setPage(1)
    clearGeneIdParam()
  }

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
            setPage(1)
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

        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Showing {changes.length} changes (page {page})
          {total !== undefined ? ` of ${total} total` : ''}
        </Typography>

        <ChangeTable changes={changes} />

        <Pagination
          page={page}
          setPage={setPage}
          hasMore={
            total !== undefined
              ? page * pageSize < total
              : changes.length >= pageSize
          }
          total={total}
        />
      </Container>
    </Nav>
  )
}

const root = document.querySelector('#root')
if (root) {
  createRoot(root).render(<RecentChangesPage />)
}
