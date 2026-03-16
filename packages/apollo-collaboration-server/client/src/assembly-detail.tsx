import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Container from '@mui/material/Container'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Link from '@mui/material/Link'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Select from '@mui/material/Select'
import TextField from '@mui/material/TextField'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
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

interface RefSeq {
  _id: string
  name: string
  assembly: string
  length: number
  description?: string
}

interface TrackConfig {
  _id: string
  trackId: string
  config: Record<string, unknown>
}

interface Organism {
  _id: string
  genus?: string
  species?: string
  commonName?: string
}

interface AssemblyPermission {
  _id: string
  user: string
  assembly: string
  role: string
}

interface User {
  _id: string
  username: string
  email: string
  role: string
}

function getAssemblyId() {
  const parts = globalThis.location.pathname.split('/').filter(Boolean)
  // /ui/assemblies/:id
  if (parts.length >= 3 && parts[0] === 'ui' && parts[1] === 'assemblies') {
    return parts[2]
  }
  return undefined
}

function PermissionsSection({
  assemblyId,
  currentUser,
}: {
  assemblyId: string
  currentUser?: User
}) {
  const [permissions, setPermissions] = useState<AssemblyPermission[]>([])
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedRole, setSelectedRole] = useState<string>('readOnly')
  const [permError, setPermError] = useState<string>()
  const [visibility, setVisibility] = useState<'public' | 'private'>('private')

  const isAdmin = currentUser?.role === 'admin'

  const loadPermissions = useCallback(async () => {
    try {
      setPermError(undefined)
      const [perms, vis] = await Promise.all([
        fetchJson<AssemblyPermission[]>(
          `/assemblies/${assemblyId}/permissions`,
        ).catch(() => [] as AssemblyPermission[]),
        fetchJson<Assembly>(`/assemblies/${assemblyId}`),
      ])
      setPermissions(perms)
      setVisibility(vis.visibility ?? 'private')
    } catch (error_) {
      setPermError(error_ instanceof Error ? error_.message : String(error_))
    }
  }, [assemblyId])

  const loadUsers = useCallback(async () => {
    try {
      setAllUsers(await fetchJson<User[]>('/users').catch(() => []))
    } catch {
      // non-critical
    }
  }, [])

  useEffect(() => {
    void loadPermissions()
    if (isAdmin) {
      void loadUsers()
    }
  }, [loadPermissions, loadUsers, isAdmin])

  async function handleAddPermission() {
    if (!selectedUserId) {
      return
    }
    try {
      setPermError(undefined)
      await fetch(`/assemblies/${assemblyId}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUserId, role: selectedRole }),
      })
      setSelectedUserId('')
      await loadPermissions()
    } catch (error_) {
      setPermError(error_ instanceof Error ? error_.message : String(error_))
    }
  }

  async function handleRemovePermission(userId: string) {
    try {
      setPermError(undefined)
      await fetch(`/assemblies/${assemblyId}/permissions/${userId}`, {
        method: 'DELETE',
      })
      await loadPermissions()
    } catch (error_) {
      setPermError(error_ instanceof Error ? error_.message : String(error_))
    }
  }

  async function handleVisibilityChange(newVisibility: 'public' | 'private') {
    try {
      setPermError(undefined)
      await fetch(`/assemblies/${assemblyId}/visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: newVisibility }),
      })
      setVisibility(newVisibility)
    } catch (error_) {
      setPermError(error_ instanceof Error ? error_.message : String(error_))
    }
  }

  if (!isAdmin) {
    return null
  }

  const usernameMap = new Map(allUsers.map((u) => [u._id, u.username]))
  const usersWithoutPermission = allUsers.filter(
    (u) =>
      u.role !== 'admin' &&
      !permissions.some((p) => p.user === u._id),
  )

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1, mt: 3 }}>
        <Typography variant="h6">Visibility & Permissions</Typography>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <Select
            value={visibility}
            onChange={(e) => {
              void handleVisibilityChange(e.target.value as 'public' | 'private')
            }}
          >
            <MenuItem value="public">Public</MenuItem>
            <MenuItem value="private">Private</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {permError ? (
        <Alert severity="error" sx={{ mb: 1 }}>
          {permError}
        </Alert>
      ) : null}

      <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>User</TableCell>
              <TableCell>Role</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {permissions.map((p) => (
              <TableRow key={p._id} hover>
                <TableCell>{usernameMap.get(p.user) ?? p.user}</TableCell>
                <TableCell>
                  <Chip label={p.role} size="small" variant="outlined" />
                </TableCell>
                <TableCell align="right">
                  <Button
                    size="small"
                    color="error"
                    onClick={() => {
                      void handleRemovePermission(p.user)
                    }}
                  >
                    Remove
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {permissions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} align="center" sx={{ color: 'text.secondary' }}>
                  {visibility === 'public'
                    ? 'Public — all users have read access'
                    : 'No per-user permissions set'}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </TableContainer>

      {usersWithoutPermission.length > 0 ? (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 3 }}>
          <Autocomplete
            size="small"
            sx={{ minWidth: 250 }}
            options={usersWithoutPermission}
            getOptionLabel={(u) => u.username}
            value={usersWithoutPermission.find((u) => u._id === selectedUserId) ?? null}
            onChange={(_event, newValue) => {
              setSelectedUserId(newValue?._id ?? '')
            }}
            renderInput={(params) => (
              <TextField {...params} label="User" />
            )}
          />
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Role</InputLabel>
            <Select
              value={selectedRole}
              label="Role"
              onChange={(e) => {
                setSelectedRole(e.target.value)
              }}
            >
              <MenuItem value="readOnly">Read Only</MenuItem>
              <MenuItem value="user">User</MenuItem>
              <MenuItem value="admin">Admin</MenuItem>
            </Select>
          </FormControl>
          <Button
            variant="contained"
            size="small"
            disabled={!selectedUserId}
            onClick={() => {
              void handleAddPermission()
            }}
          >
            Add
          </Button>
        </Box>
      ) : null}
    </>
  )
}

function AssemblyDetailPage() {
  const assemblyId = getAssemblyId()
  const [assembly, setAssembly] = useState<Assembly>()
  const [refSeqs, setRefSeqs] = useState<RefSeq[]>([])
  const [tracks, setTracks] = useState<TrackConfig[]>([])
  const [organism, setOrganism] = useState<Organism>()
  const [currentUser, setCurrentUser] = useState<User>()
  const [error, setError] = useState<string>()

  const load = useCallback(async () => {
    if (!assemblyId) {
      setError('No assembly ID in URL')
      return
    }
    try {
      setError(undefined)
      const [assemblyData, refSeqData, trackData, userData] = await Promise.all([
        fetchJson<Assembly>(`/assemblies/${assemblyId}`),
        fetchJson<RefSeq[]>(`/refSeqs?assembly=${assemblyId}`),
        fetchJson<TrackConfig[]>(`/tracks?assembly=${assemblyId}`),
        fetchJson<User>('/users/me').catch(() => undefined),
      ])
      setAssembly(assemblyData)
      setRefSeqs(refSeqData)
      setTracks(trackData)
      setCurrentUser(userData)

      if (assemblyData.organism) {
        try {
          const org = await fetchJson<Organism>(
            `/organisms/${assemblyData.organism}`,
          )
          setOrganism(org)
        } catch {
          // organism fetch is non-critical
        }
      }
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_))
    }
  }, [assemblyId])

  useEffect(() => {
    void load()
  }, [load])

  const displayName = assembly?.displayName ?? assembly?.name ?? assemblyId

  return (
    <Nav current="assemblies">
      <Container>
        <Breadcrumbs sx={{ mb: 2 }}>
          <Link underline="hover" color="inherit" href="/ui/assemblies/">
            Assemblies
          </Link>
          <Typography color="text.primary">{displayName}</Typography>
        </Breadcrumbs>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {assembly ? (
          <>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                mb: 1,
              }}
            >
              <Typography variant="h4">{displayName}</Typography>
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
                  label={
                    `${organism.genus ?? ''} ${organism.species ?? ''}`.trim() ||
                    organism.commonName ||
                    'Unknown organism'
                  }
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
                href={`/jbrowse/?config=${encodeURIComponent(`/jbrowse/config.json?assemblies=${assembly._id}`)}`}
              >
                Open in JBrowse
              </Button>
              <Button
                variant="outlined"
                size="small"
                href={`/ui/sequence-search/?assembly=${encodeURIComponent(assembly._id)}`}
              >
                Sequence Search
              </Button>
            </Box>

            <Typography variant="h6" sx={{ mb: 1 }}>
              Reference Sequences ({refSeqs.length})
            </Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell align="right">Length</TableCell>
                    <TableCell>Description</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {refSeqs.map((r) => (
                    <TableRow key={r._id} hover>
                      <TableCell>{r.name}</TableCell>
                      <TableCell align="right">
                        {r.length.toLocaleString()}
                      </TableCell>
                      <TableCell>{r.description ?? ''}</TableCell>
                    </TableRow>
                  ))}
                  {refSeqs.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        align="center"
                        sx={{ color: 'text.secondary' }}
                      >
                        No reference sequences
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </TableContainer>

            <Typography variant="h6" sx={{ mb: 1 }}>
              Evidence Tracks ({tracks.length})
            </Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Track ID</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tracks.map((t) => (
                    <TableRow key={t._id} hover>
                      <TableCell>
                        {(t.config.name as string) ?? t.trackId}
                      </TableCell>
                      <TableCell>{(t.config.type as string) ?? ''}</TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                        >
                          {t.trackId}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                  {tracks.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        align="center"
                        sx={{ color: 'text.secondary' }}
                      >
                        No evidence tracks
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </TableContainer>

            {assemblyId ? (
              <PermissionsSection
                assemblyId={assemblyId}
                currentUser={currentUser}
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
  createRoot(root).render(<AssemblyDetailPage />)
}
