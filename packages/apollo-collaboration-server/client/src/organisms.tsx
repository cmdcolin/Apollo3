import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Container from '@mui/material/Container'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import { createRoot } from 'react-dom/client'
import useSWR from 'swr'

import { Nav } from './Nav.js'
import { fetchJson } from './fetchUtil.js'
import { type Organism, organismLabel } from './organism-utils.js'

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
  const { data: organisms, error, isLoading } =
    useSWR<Organism[], unknown>('/organisms', fetchJson)

  return (
    <Nav current="organisms">
      <Container>
        <Typography variant="h4" gutterBottom>
          Organisms
        </Typography>
        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error instanceof Error ? error.message : 'Unknown error'}
          </Alert>
        ) : null}
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
            <CircularProgress />
          </Box>
        ) : organisms ? (
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
        ) : null}
      </Container>
    </Nav>
  )
}

const root = document.querySelector('#root')
if (root) {
  createRoot(root).render(<OrganismsPage />)
}
