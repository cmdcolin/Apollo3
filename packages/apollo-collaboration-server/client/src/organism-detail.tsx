import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Container from '@mui/material/Container'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
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
      <Link href={`/ui/assemblies/${params.row._id}`}>{params.value}</Link>
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
        href={`/jbrowse/?config=${encodeURIComponent(`/jbrowse/config.json?assemblies=${params.row._id}`)}`}
      >
        Open in JBrowse
      </Link>
    ),
  },
]

function OrganismEditSection({
  organism,
  onUpdated,
  onDeleted,
}: {
  organism: Organism
  onUpdated: (updated: Organism) => void
  onDeleted: () => void
}) {
  const [genus, setGenus] = useState(organism.genus ?? '')
  const [species, setSpecies] = useState(organism.species ?? '')
  const [commonName, setCommonName] = useState(organism.commonName ?? '')
  const [description, setDescription] = useState(organism.description ?? '')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editError, setEditError] = useState<string>()

  async function handleSave() {
    setSaving(true)
    setEditError(undefined)
    try {
      const res = await fetch(`/organisms/${organism._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          genus: genus.trim(),
          species: species.trim(),
          commonName: commonName.trim(),
          description: description.trim(),
        }),
      })
      if (!res.ok) {
        throw new Error(`Failed: ${res.status}`)
      }
      const updated = (await res.json()) as Organism
      onUpdated(updated)
    } catch (error_) {
      setEditError(error_ instanceof Error ? error_.message : String(error_))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setEditError(undefined)
    try {
      const res = await fetch(`/organisms/${organism._id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        throw new Error(`Failed: ${res.status}`)
      }
      onDeleted()
    } catch (error_) {
      setEditError(error_ instanceof Error ? error_.message : String(error_))
    }
  }

  return (
    <>
      <Typography variant="h6" sx={{ mt: 3, mb: 1 }}>
        Edit Organism
      </Typography>

      {editError ? (
        <Alert severity="error" sx={{ mb: 1 }}>
          {editError}
        </Alert>
      ) : null}

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
        <TextField
          size="small"
          label="Genus"
          value={genus}
          onChange={(e) => {
            setGenus(e.target.value)
          }}
        />
        <TextField
          size="small"
          label="Species"
          value={species}
          onChange={(e) => {
            setSpecies(e.target.value)
          }}
        />
        <TextField
          size="small"
          label="Common name"
          value={commonName}
          onChange={(e) => {
            setCommonName(e.target.value)
          }}
        />
      </Box>
      <Box sx={{ mb: 2 }}>
        <TextField
          fullWidth
          size="small"
          label="Description"
          value={description}
          onChange={(e) => {
            setDescription(e.target.value)
          }}
        />
      </Box>
      <Box sx={{ mb: 3 }}>
        <Button
          variant="contained"
          size="small"
          disabled={saving}
          onClick={() => {
            void handleSave()
          }}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </Box>

      <Typography variant="h6" sx={{ mt: 3, mb: 1, color: 'error.main' }}>
        Danger Zone
      </Typography>
      <Paper variant="outlined" sx={{ p: 2, borderColor: 'error.main' }}>
        <Typography variant="body2" sx={{ mb: 1 }}>
          Deleting an organism removes its record but does not delete associated
          assemblies.
        </Typography>
        {confirmDelete ? (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Typography variant="body2" color="error">
              Are you sure?
            </Typography>
            <Button
              variant="contained"
              color="error"
              size="small"
              onClick={() => {
                void handleDelete()
              }}
            >
              Yes, delete permanently
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={() => {
                setConfirmDelete(false)
              }}
            >
              Cancel
            </Button>
          </Box>
        ) : (
          <Button
            variant="outlined"
            color="error"
            size="small"
            onClick={() => {
              setConfirmDelete(true)
            }}
          >
            Delete Organism
          </Button>
        )}
      </Paper>
    </>
  )
}

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
            <Typography variant="h4" sx={{ mb: 1 }}>
              {organism.genus || organism.species ? (
                <em>
                  {organism.genus ?? ''} {organism.species ?? ''}
                </em>
              ) : (
                (organism.commonName ?? organismId)
              )}
            </Typography>

            {organism.commonName && (organism.genus || organism.species) ? (
              <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
                {organism.commonName}
              </Typography>
            ) : null}

            {organism.description ? (
              <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                {organism.description}
              </Typography>
            ) : null}

            {organism.taxid ? (
              <Chip
                label={`Taxid: ${organism.taxid}`}
                size="small"
                variant="outlined"
                sx={{ mb: 3 }}
              />
            ) : null}

            <Typography variant="h6" sx={{ mb: 1 }}>
              Assemblies ({assemblies.length})
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

            {currentUser?.role === 'admin' && organismId ? (
              <OrganismEditSection
                organism={organism}
                onUpdated={(updated) => {
                  setOrganism(updated)
                }}
                onDeleted={() => {
                  globalThis.location.href = '/ui/organisms/'
                }}
              />
            ) : null}
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
