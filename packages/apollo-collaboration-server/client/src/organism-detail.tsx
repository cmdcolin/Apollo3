import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import Button from '@mui/material/Button'
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
import { type Organism, organismLabel } from './organism-utils.js'

interface Assembly {
  _id: string
  name: string
  displayName?: string
  description?: string
  organism?: string
  visibility?: 'public' | 'private'
}

interface User {
  _id: string
  username: string
  email: string
  role: string
}

function getOrganismId() {
  const parts = globalThis.location.pathname.split('/').filter(Boolean)
  // /ui/organisms/:id
  if (parts.length >= 3 && parts[0] === 'ui' && parts[1] === 'organisms') {
    return parts[2]
  }
}

type AssemblyRow = Assembly & { id: string }

const assemblyColumns: GridColDef<AssemblyRow>[] = [
  {
    field: 'name',
    headerName: 'Name',
    flex: 1,
    renderCell: (params) => (
      <Link href={`/ui/assemblies/${params.row.name}`}>{params.value}</Link>
    ),
  },
  { field: 'displayName', headerName: 'Display Name', flex: 1 },
  {
    field: 'visibility',
    headerName: 'Visibility',
    width: 120,
    renderCell: (
      params: GridRenderCellParams<AssemblyRow, Assembly['visibility']>,
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


function OrganismDetailPage() {
  const organismId = getOrganismId()
  const [organism, setOrganism] = useState<Organism>()
  const [assemblies, setAssemblies] = useState<Assembly[]>([])
  const [currentUser, setCurrentUser] = useState<User>()
  const [error, setError] = useState<string>()

  const load = useCallback(async () => {
    if (!organismId) {
      setError('No organism ID in URL')
      return
    }
    try {
      setError(undefined)
      const [organismData, allAssemblies, userData] = await Promise.all([
        fetchJson<Organism>(`/organisms/${organismId}`),
        fetchJson<Assembly[]>('/assemblies'),
        fetchJson<User>('/users/me').catch((): User | undefined => undefined),
      ])
      setOrganism(organismData)
      setAssemblies(allAssemblies.filter((a) => a.organism === organismId))
      setCurrentUser(userData)
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_))
    }
  }, [organismId])

  useEffect(() => {
    void load()
  }, [load])

  const displayName = organism ? organismLabel(organism) : organismId

  return (
    <Nav current="organisms">
      <Container>
        <Breadcrumbs sx={{ mb: 2 }}>
          <Link underline="hover" color="inherit" href="/ui/organisms/">
            Organisms
          </Link>
          <Typography color="text.primary">{displayName}</Typography>
        </Breadcrumbs>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {organism ? (
          <>
            <Box sx={{ mb: 3 }}>
              {organism.genus || organism.species ? (
                <Typography variant="body1">
                  <strong>Scientific name:</strong>{' '}
                  <em>
                    {`${organism.genus ?? ''} ${organism.species ?? ''}`.trim()}
                  </em>
                </Typography>
              ) : null}
              {organism.commonName ? (
                <Typography variant="body1">
                  <strong>Common name:</strong> {organism.commonName}
                </Typography>
              ) : null}
              {organism.description ? (
                <Typography variant="body1">
                  <strong>Description:</strong> {organism.description}
                </Typography>
              ) : null}
              {organism.taxid ? (
                <Typography variant="body1">
                  <strong>Taxid:</strong> {organism.taxid}
                </Typography>
              ) : null}
              {currentUser?.role === 'admin' && organismId ? (
                <Box sx={{ mt: 1 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    href={`/ui/edit-organism/${organismId}`}
                  >
                    Edit organism
                  </Button>
                </Box>
              ) : null}
            </Box>

            <Typography variant="h6" sx={{ mb: 1 }}>
              Assemblies for this organism ({assemblies.length})
            </Typography>

            <Box sx={{ height: 400 }}>
              <DataGrid
                rows={assemblies.map((a) => ({ ...a, id: a._id }))}
                columns={assemblyColumns}
                density="compact"
                pageSizeOptions={[25, 50, 100]}
                initialState={{
                  pagination: { paginationModel: { pageSize: 25 } },
                }}
              />
            </Box>
          </>
        ) : null}
      </Container>
    </Nav>
  )
}

const root = document.querySelector('#root')
if (root) {
  createRoot(root).render(<OrganismDetailPage />)
}
