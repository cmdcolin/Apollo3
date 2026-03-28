import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Container from '@mui/material/Container'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import {
  DataGrid,
  type GridColDef,
  type GridRenderCellParams,
} from '@mui/x-data-grid'
import { createRoot } from 'react-dom/client'
import useSWR from 'swr'

import { Nav } from './Nav.js'
import { fetchJson } from './fetchUtil.js'

interface Assembly {
  _id: string
  name: string
  displayName: string
  description?: string
  organism?: string
  visibility?: 'public' | 'private'
}

const columns: GridColDef<Assembly>[] = [
  {
    field: 'name',
    headerName: 'Name',
    flex: 1,
    renderCell: (params) => (
      <Link href={`/ui/assemblies/${params.row.name}`}>{params.value}</Link>
    ),
  },
  { field: 'displayName', headerName: 'Display Name', flex: 1 },
  { field: 'description', headerName: 'Description', flex: 1.5 },
  {
    field: 'organism',
    headerName: 'Organism',
    flex: 1,
    renderCell: (params) =>
      params.value ? (
        <Link href={`/ui/organisms/${params.value}`}>{params.value}</Link>
      ) : null,
  },
  {
    field: 'visibility',
    headerName: 'Visibility',
    width: 120,
    renderCell: (
      params: GridRenderCellParams<Assembly, Assembly['visibility']>,
    ) => {
      const v = params.value ?? 'private'
      return (
        <Chip
          label={v}
          size="small"
          color={v === 'public' ? 'success' : 'default'}
          variant="outlined"
        />
      )
    },
  },
  {
    field: 'open',
    headerName: 'Open',
    width: 140,
    sortable: false,
    renderCell: (params) => (
      <Link
        href={`/jbrowse/?assemblies=${encodeURIComponent(params.row.name)}`}
      >
        Open in JBrowse
      </Link>
    ),
  },
]

function AssembliesPage() {
  const { data: assemblies, error, isLoading } =
    useSWR<Assembly[], unknown>('/assemblies', fetchJson)

  return (
    <Nav current="assemblies">
      <Container>
        <Typography variant="h4" gutterBottom>
          Assemblies
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
        ) : (assemblies ? (
          <Box sx={{ height: 600 }}>
            <DataGrid
              rows={assemblies.map((a) => ({ ...a, id: a._id }))}
              columns={columns}
              density="compact"
              pageSizeOptions={[25, 50, 100]}
              initialState={{
                pagination: { paginationModel: { pageSize: 25 } },
              }}
            />
          </Box>
        ) : null)}
      </Container>
    </Nav>
  )
}

const root = document.querySelector('#root')
if (root) {
  createRoot(root).render(<AssembliesPage />)
}
