import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import CircularProgress from '@mui/material/CircularProgress'
import Container from '@mui/material/Container'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import { createRoot } from 'react-dom/client'
import useSWR from 'swr'

import { Nav } from './Nav.js'
import { fetchJson } from './fetchUtil.js'

interface Assembly {
  _id: string
  name: string
  displayName: string
}

interface TrackConfig {
  _id: string
  trackId: string
  config: Record<string, unknown>
}

function getAssemblyName() {
  const parts = globalThis.location.pathname.split('/').filter(Boolean)
  if (parts.length >= 3 && parts[0] === 'ui' && parts[1] === 'assembly-tracks') {
    return decodeURIComponent(parts[2])
  }
}

type TrackRow = TrackConfig & { id: string }

const trackColumns: GridColDef<TrackRow>[] = [
  {
    field: 'name',
    headerName: 'Name',
    flex: 1,
    renderCell: (params) => {
      const n = params.row.config.name
      return typeof n === 'string' ? n : params.row.trackId
    },
  },
  {
    field: 'type',
    headerName: 'Type',
    flex: 1,
    renderCell: (params) => {
      const t = params.row.config.type
      return typeof t === 'string' ? t : ''
    },
  },
  {
    field: 'trackId',
    headerName: 'Track ID',
    flex: 1.5,
    renderCell: (params) => (
      <Typography
        variant="body2"
        sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
      >
        {params.value}
      </Typography>
    ),
  },
]

const assemblyName = getAssemblyName()

function AssemblyTracksPage() {
  const encodedName = assemblyName
    ? encodeURIComponent(assemblyName)
    : undefined
  const {
    data: assembly,
    error: assemblyError,
    isLoading,
  } = useSWR<Assembly, unknown>(
    encodedName ? `/assemblies/by-name/${encodedName}` : null,
    fetchJson,
  )
  const { data: tracks } = useSWR<TrackConfig[]>(
    assembly ? `/tracks?assembly=${assembly._id}` : null,
    fetchJson,
  )

  if (!assemblyName) {
    return (
      <Nav current="assemblies">
        <Container>
          <Alert severity="error">No assembly name in URL</Alert>
        </Container>
      </Nav>
    )
  }

  if (assemblyError) {
    return (
      <Nav current="assemblies">
        <Container>
          <Alert severity="error">
            {assemblyError instanceof Error
              ? assemblyError.message
              : 'Unknown error'}
          </Alert>
        </Container>
      </Nav>
    )
  }

  if (isLoading || !assembly) {
    return (
      <Nav current="assemblies">
        <Container>
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
            <CircularProgress />
          </Box>
        </Container>
      </Nav>
    )
  }

  return (
    <Nav current="assemblies">
      <Container>
        <Breadcrumbs sx={{ mb: 2 }}>
          <Link underline="hover" color="inherit" href="/ui/assemblies/">
            Assemblies
          </Link>
          <Link
            underline="hover"
            color="inherit"
            href={`/ui/assemblies/${assemblyName}`}
          >
            {assembly.displayName}
          </Link>
          <Typography color="text.primary">Tracks</Typography>
        </Breadcrumbs>

        <Typography variant="h4" sx={{ mb: 2 }}>
          Tracks — {assembly.displayName}
        </Typography>

        <Box sx={{ height: 600 }}>
          {tracks ? (
            <DataGrid
              rows={tracks.map((t) => ({ ...t, id: t._id }))}
              columns={trackColumns}
              density="compact"
              pageSizeOptions={[25, 50, 100]}
              initialState={{
                pagination: { paginationModel: { pageSize: 25 } },
              }}
            />
          ) : (
            <CircularProgress size={24} />
          )}
        </Box>
      </Container>
    </Nav>
  )
}

const root = document.querySelector('#root')
if (root) {
  createRoot(root).render(<AssemblyTracksPage />)
}
