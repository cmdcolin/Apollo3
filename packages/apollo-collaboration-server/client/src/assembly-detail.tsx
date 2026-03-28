import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
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

interface Assembly {
  _id: string
  name: string
  displayName: string
  description?: string
  organism?: string
  visibility?: 'public' | 'private'
}

interface RefSeq {
  _id: string
  name: string
  length: number
  description?: string
}

interface TrackConfig {
  _id: string
  trackId: string
  config: Record<string, unknown>
}

interface User {
  _id: string
  role: string
}

function getAssemblyName() {
  const parts = globalThis.location.pathname.split('/').filter(Boolean)
  if (parts.length >= 3 && parts[0] === 'ui' && parts[1] === 'assemblies') {
    return decodeURIComponent(parts[2])
  }
  return
}

type RefSeqRow = RefSeq & { id: string }
type TrackRow = TrackConfig & { id: string }

const refSeqColumns: GridColDef<RefSeqRow>[] = [
  { field: 'name', headerName: 'Name', flex: 1 },
  {
    field: 'length',
    headerName: 'Length',
    width: 130,
    type: 'number',
    renderCell: (params) =>
      typeof params.value === 'number' ? params.value.toLocaleString() : '',
  },
  { field: 'description', headerName: 'Description', flex: 2 },
]

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

function AssemblyDetailPage() {
  const encodedName = assemblyName
    ? encodeURIComponent(assemblyName)
    : undefined
  const {
    data: assembly,
    error: assemblyError,
    isLoading,
  } = useSWR<Assembly>(
    encodedName ? `/assemblies/by-name/${encodedName}` : null,
    fetchJson,
  )
  const { data: refSeqs } = useSWR<RefSeq[]>(
    encodedName ? `/refSeqs?assembly=${encodedName}` : null,
    fetchJson,
  )
  const { data: tracks } = useSWR<TrackConfig[]>(
    assembly ? `/tracks?assembly=${assembly._id}` : null,
    fetchJson,
  )
  const { data: currentUser } = useSWR<User>('/users/me', fetchJson)
  const { data: organism } = useSWR<Organism>(
    assembly?.organism ? `/organisms/${assembly.organism}` : null,
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
              : String(assemblyError)}
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
          <Typography color="text.primary">{assembly.displayName}</Typography>
        </Breadcrumbs>

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            mb: 1,
          }}
        >
          <Typography variant="h4">{assembly.displayName}</Typography>
          <Chip
            label={assembly.visibility ?? 'private'}
            size="small"
            color={assembly.visibility === 'public' ? 'success' : 'default'}
            variant="outlined"
          />
        </Box>

        {assembly.description ? (
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            {assembly.description}
          </Typography>
        ) : null}

        <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          {organism ? (
            <Chip
              label={organismLabel(organism)}
              size="small"
              variant="outlined"
              component="a"
              href={`/ui/organisms/${assembly.organism}`}
              clickable
            />
          ) : null}
          <Button
            variant="contained"
            size="small"
            href={`/jbrowse/?assemblies=${encodeURIComponent(assembly.name)}`}
          >
            Open in JBrowse
          </Button>
          <Button
            variant="outlined"
            size="small"
            href={`/ui/sequence-search/?assembly=${encodeURIComponent(assembly.name)}`}
          >
            Sequence Search
          </Button>
          <Button
            variant="outlined"
            size="small"
            href={`/ui/assembly-checks/${assembly.name}`}
          >
            Checks
          </Button>
          {currentUser?.role === 'admin' ? (
            <Button
              variant="outlined"
              size="small"
              href={`/ui/assembly-admin/${assembly.name}`}
            >
              Admin
            </Button>
          ) : null}
        </Box>

        <Typography variant="h6" sx={{ mb: 1 }}>
          Reference Sequences ({refSeqs?.length ?? '...'})
        </Typography>
        <Box sx={{ height: 400, mb: 3 }}>
          {refSeqs ? (
            <DataGrid
              rows={refSeqs.map((r) => ({ ...r, id: r._id }))}
              columns={refSeqColumns}
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

        <Typography variant="h6" sx={{ mb: 1 }}>
          Evidence Tracks ({tracks?.length ?? '...'})
        </Typography>
        <Box sx={{ height: 400 }}>
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
  createRoot(root).render(<AssemblyDetailPage />)
}
