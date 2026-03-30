import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { Nav } from './Nav.js'
import { fetchJson } from './fetchUtil.js'
import { type Organism, organismLabel } from './organism-utils.js'

interface User {
  _id: string
  username: string
  role: string
}

function getOrganismId() {
  const parts = globalThis.location.pathname.split('/').filter(Boolean)
  // /ui/edit-organism/:id
  if (parts.length >= 3 && parts[0] === 'ui' && parts[1] === 'edit-organism') {
    return parts[2]
  }
}

function OrganismAdminPage() {
  const organismId = getOrganismId()
  const [organism, setOrganism] = useState<Organism>()
  const [genus, setGenus] = useState('')
  const [species, setSpecies] = useState('')
  const [commonName, setCommonName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string>()

  const load = useCallback(async () => {
    if (!organismId) {
      setError('No organism ID in URL')
      return
    }
    try {
      setError(undefined)
      const [organismData, userData] = await Promise.all([
        fetchJson<Organism>(`/organisms/${organismId}`),
        fetchJson<User>('/users/me').catch((): User | undefined => undefined),
      ])
      if (!userData?.role || userData.role !== 'admin') {
        setError('Admin access required')
        return
      }
      setOrganism(organismData)
      setGenus(organismData.genus ?? '')
      setSpecies(organismData.species ?? '')
      setCommonName(organismData.commonName ?? '')
      setDescription(organismData.description ?? '')
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_))
    }
  }, [organismId])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSave() {
    if (!organism) {
      return
    }
    setSaving(true)
    setError(undefined)
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
      setOrganism(updated)
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!organism) {
      return
    }
    setError(undefined)
    try {
      const res = await fetch(`/organisms/${organism._id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        throw new Error(`Failed: ${res.status}`)
      }
      globalThis.location.href = '/ui/organisms/'
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_))
    }
  }

  const displayName = organism ? organismLabel(organism) : organismId

  return (
    <Nav current="organisms">
      <Container>
        <Breadcrumbs sx={{ mb: 2 }}>
          <Link underline="hover" color="inherit" href="/ui/organisms/">
            Organisms
          </Link>
          <Link
            underline="hover"
            color="inherit"
            href={`/ui/organisms/${organismId}`}
          >
            {displayName}
          </Link>
          <Typography color="text.primary">Admin</Typography>
        </Breadcrumbs>

        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}

        {organism ? (
          <>
            <Typography variant="h4" sx={{ mb: 3 }}>
              Admin — {displayName}
            </Typography>

            <Typography variant="h6" sx={{ mb: 1 }}>
              Edit Organism
            </Typography>

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
            <Box sx={{ mb: 4 }}>
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

            <Typography variant="h6" sx={{ mb: 1, color: 'error.main' }}>
              Danger Zone
            </Typography>
            <Paper variant="outlined" sx={{ p: 2, borderColor: 'error.main' }}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Deleting an organism removes its record but does not delete
                associated assemblies.
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
        ) : null}
      </Container>
    </Nav>
  )
}

const root = document.querySelector('#root')
if (root) {
  createRoot(root).render(<OrganismAdminPage />)
}
