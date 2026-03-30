import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Container from '@mui/material/Container'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { Nav } from './Nav.js'
import { fetchJson } from './fetchUtil.js'
import { type Organism, organismLabel } from './organism-utils.js'

function useIsAuthenticated() {
  const [authenticated, setAuthenticated] = useState<boolean | undefined>(
    undefined,
  )

  useEffect(() => {
    fetch('/users/me', { headers: { Accept: 'application/json' } })
      .then((r) => {
        setAuthenticated(r.ok)
      })
      .catch(() => {
        setAuthenticated(false)
      })
  }, [])

  return authenticated
}

const columns: GridColDef<Organism>[] = [
  {
    field: '_id',
    headerName: 'ID',
    width: 220,
    renderCell: (params) => (
      <Link href={`/ui/organisms/${params.value}`}>{params.value}</Link>
    ),
  },
  { field: 'taxid', headerName: 'Taxid', width: 100 },
  {
    field: 'scientificName',
    headerName: 'Scientific Name',
    flex: 1,
    valueGetter: (_value, row) => organismLabel(row),
  },
  { field: 'commonName', headerName: 'Common Name', flex: 1 },
  { field: 'description', headerName: 'Description', flex: 2 },
]

function OrganismsPage() {
  const authenticated = useIsAuthenticated()
  const [organisms, setOrganisms] = useState<Organism[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const isGuest = authenticated === false

  useEffect(() => {
    if (authenticated === undefined) {
      return
    }
    const endpoint = authenticated ? '/organisms' : '/organisms/public'
    setLoading(true)
    setError(undefined)
    fetchJson<Organism[]>(endpoint)
      .then((items) => {
        setOrganisms(items)
      })
      .catch((error_: unknown) => {
        setError(error_ instanceof Error ? error_.message : String(error_))
      })
      .finally(() => {
        setLoading(false)
      })
  }, [authenticated])

  return (
    <Nav current="organisms">
      <Container>
        <Typography variant="h4" gutterBottom>
          {isGuest ? 'Public Organisms' : 'Organisms'}
        </Typography>
        {isGuest ? (
          <Alert severity="info" sx={{ mb: 2 }}>
            Showing organisms with publicly accessible assemblies.{' '}
            <Link href="/">Sign in</Link> to see all organisms.
          </Alert>
        ) : null}
        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}
        {loading || authenticated === undefined ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box sx={{ height: 600 }}>
            <DataGrid
              rows={organisms.map((o) => ({ ...o, id: o._id }))}
              columns={columns}
              density="compact"
              pageSizeOptions={[25, 50, 100]}
              initialState={{
                pagination: { paginationModel: { pageSize: 25 } },
              }}
            />
          </Box>
        )}
      </Container>
    </Nav>
  )
}

const root = document.querySelector('#root')
if (root) {
  createRoot(root).render(<OrganismsPage />)
}
