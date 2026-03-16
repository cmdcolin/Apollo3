import Alert from '@mui/material/Alert'
import Chip from '@mui/material/Chip'
import Container from '@mui/material/Container'
import Link from '@mui/material/Link'
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

interface Assembly {
  _id: string
  name: string
  displayName?: string
  description?: string
  organism?: string
  visibility?: 'public' | 'private'
}

function AssembliesPage() {
  const [assemblies, setAssemblies] = useState<Assembly[]>([])
  const [error, setError] = useState<string>()

  const load = useCallback(async () => {
    try {
      setError(undefined)
      setAssemblies(await fetchJson<Assembly[]>('/assemblies'))
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <Nav current="assemblies">
      <Container>
        <Typography variant="h4" gutterBottom>
          Assemblies
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Total: {assemblies.length}
        </Typography>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Display Name</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Organism</TableCell>
                <TableCell>Visibility</TableCell>
                <TableCell>Open</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {assemblies.map((a) => (
                <TableRow key={a._id} hover>
                  <TableCell>
                    <Link href={`/ui/assemblies/${a._id}`}>{a.name}</Link>
                  </TableCell>
                  <TableCell>{a.displayName ?? ''}</TableCell>
                  <TableCell>{a.description ?? ''}</TableCell>
                  <TableCell>
                    {a.organism ? (
                      <Link href={`/ui/organisms/${a.organism}`}>
                        {a.organism}
                      </Link>
                    ) : (
                      ''
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={a.visibility ?? 'private'}
                      size="small"
                      color={a.visibility === 'public' ? 'success' : 'default'}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/jbrowse/?config=${encodeURIComponent(`/jbrowse/config.json?assemblies=${a._id}`)}`}
                    >
                      Open in JBrowse
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {assemblies.length === 0 && !error && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    align="center"
                    sx={{ color: 'text.secondary' }}
                  >
                    No assemblies found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Container>
    </Nav>
  )
}

const root = document.querySelector('#root')
if (root) {
  createRoot(root).render(<AssembliesPage />)
}
