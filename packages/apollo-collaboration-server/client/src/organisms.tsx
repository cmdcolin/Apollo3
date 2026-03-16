import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { Nav } from './Nav.js'
import { fetchJson } from './fetchUtil.js'

interface Organism {
  _id: string
  taxid?: number
  genus?: string
  species?: string
  commonName?: string
  description?: string
}

function OrganismsPage() {
  const [organisms, setOrganisms] = useState<Organism[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [error, setError] = useState<string>()
  const pageSize = 25

  const load = useCallback(async () => {
    try {
      setError(undefined)
      const offset = (page - 1) * pageSize
      const [items, countData] = await Promise.all([
        fetchJson<Organism[]>(`/organisms?offset=${offset}&limit=${pageSize}`),
        fetchJson<{ count: number }>('/organisms/count'),
      ])
      setOrganisms(items)
      setTotal(countData.count)
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_))
    }
  }, [page])

  useEffect(() => {
    void load()
  }, [load])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <Nav current="organisms">
      <Container>
        <Typography variant="h4" gutterBottom>
          Organisms
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Total: {total} | Page {page} of {totalPages}
        </Typography>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>Taxid</TableCell>
                <TableCell>Genus</TableCell>
                <TableCell>Species</TableCell>
                <TableCell>Common Name</TableCell>
                <TableCell>Description</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {organisms.map((o) => (
                <TableRow key={o._id} hover>
                  <TableCell>{o._id}</TableCell>
                  <TableCell>{o.taxid ?? ''}</TableCell>
                  <TableCell>{o.genus ?? ''}</TableCell>
                  <TableCell>{o.species ?? ''}</TableCell>
                  <TableCell>{o.commonName ?? ''}</TableCell>
                  <TableCell>{o.description ?? ''}</TableCell>
                </TableRow>
              ))}
              {organisms.length === 0 && !error && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    align="center"
                    sx={{ color: 'text.secondary' }}
                  >
                    No organisms found
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
            onClick={() => {
              setPage(page - 1)
            }}
          >
            Previous
          </Button>
          <Typography variant="body2">
            Page {page} of {totalPages}
          </Typography>
          <Button
            size="small"
            disabled={page >= totalPages}
            onClick={() => {
              setPage(page + 1)
            }}
          >
            Next
          </Button>
        </Box>
      </Container>
    </Nav>
  )
}

const root = document.querySelector('#root')
if (root) {
  createRoot(root).render(<OrganismsPage />)
}
