import { createRoot } from 'react-dom/client'
import { useCallback, useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'

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

function RecentChangesPage() {
  const [changes, setChanges] = useState<ChangeRow[]>([])
  const [page, setPage] = useState(1)
  const [error, setError] = useState<string>()
  const pageSize = 25

  const load = useCallback(async () => {
    try {
      setError(undefined)
      setChanges(
        await fetchJson<ChangeRow[]>(
          `/changes/recent?limit=${pageSize}&page=${page}`,
        ),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [page])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <Nav current="changes">
      <Container>
        <Typography variant="h4" gutterBottom>
          Recent Changes
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Showing {changes.length} changes (page {page})
        </Typography>
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
                    <TableCell>{idsDisplay}</TableCell>
                    <TableCell>{date}</TableCell>
                  </TableRow>
                )
              })}
              {changes.length === 0 && !error && (
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
        <Box sx={{ display: 'flex', gap: 1, mt: 2, alignItems: 'center' }}>
          <Button
            size="small"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <Typography variant="body2">Page {page}</Typography>
          <Button
            size="small"
            disabled={changes.length < pageSize}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </Box>
      </Container>
    </Nav>
  )
}

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(<RecentChangesPage />)
}
