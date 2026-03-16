import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
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
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useMemo, useState } from 'react'
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
  const [search, setSearch] = useState('')

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

  const filtered = useMemo(() => {
    if (!search.trim()) {
      return assemblies
    }
    const q = search.toLowerCase()
    return assemblies.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.displayName?.toLowerCase().includes(q) ?? false) ||
        (a.description?.toLowerCase().includes(q) ?? false),
    )
  }, [assemblies, search])

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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <TextField
            size="small"
            placeholder="Search assemblies..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
            }}
            sx={{ minWidth: 250 }}
          />
          <Typography variant="body2" color="text.secondary">
            Showing {filtered.length} of {assemblies.length}
          </Typography>
        </Box>
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
              {filtered.map((a) => (
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
              {filtered.length === 0 && !error && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    align="center"
                    sx={{ color: 'text.secondary' }}
                  >
                    {search ? 'No matching assemblies' : 'No assemblies found'}
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
