import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { Nav } from './Nav.js'
import { fetchJson } from './fetchUtil.js'
import type { Organism } from './organism-utils.js'

function OrganismsPage() {
  const [organisms, setOrganisms] = useState<Organism[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  const load = useCallback(async () => {
    try {
      setError(undefined)
      setLoading(true)
      const items = await fetchJson<Organism[]>('/organisms')
      setOrganisms(items)
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

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
    { field: 'genus', headerName: 'Genus', flex: 1 },
    { field: 'species', headerName: 'Species', flex: 1 },
    { field: 'commonName', headerName: 'Common Name', flex: 1 },
    { field: 'description', headerName: 'Description', flex: 2 },
  ]

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
        <Box sx={{ height: 600 }}>
          <DataGrid
            rows={organisms.map((o) => ({ ...o, id: o._id }))}
            columns={columns}
            density="compact"
            loading={loading}
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
  createRoot(root).render(<OrganismsPage />)
}
