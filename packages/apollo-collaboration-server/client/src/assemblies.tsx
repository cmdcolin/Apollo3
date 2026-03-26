import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Container from '@mui/material/Container'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import {
  DataGrid,
  type GridColDef,
  type GridRenderCellParams,
} from '@mui/x-data-grid'
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

  const columns: GridColDef<Assembly>[] = [
    {
      field: 'name',
      headerName: 'Name',
      flex: 1,
      renderCell: (params) => (
        <Link href={`/ui/assemblies/${params.row._id}`}>{params.value}</Link>
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
          href={`/jbrowse/?config=${encodeURIComponent(`/jbrowse/config.json?assemblies=${params.row._id}`)}`}
        >
          Open in JBrowse
        </Link>
      ),
    },
  ]

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
        <Box sx={{ height: 600 }}>
          <DataGrid
            rows={assemblies.map((a) => ({ ...a, id: a._id }))}
            columns={columns}
            density="compact"
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
  createRoot(root).render(<AssembliesPage />)
}
