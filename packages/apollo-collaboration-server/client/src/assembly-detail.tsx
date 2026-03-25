import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import Container from '@mui/material/Container'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import InputLabel from '@mui/material/InputLabel'
import Link from '@mui/material/Link'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Select from '@mui/material/Select'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
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
  aliases?: string[]
  checks?: string[]
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
      await fetch(`/assemblies/${assemblyId}`, {
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
    (u) => u.role !== 'admin' && !permissions.some((p) => p.user === u._id),
  )

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1, mt: 3 }}>
        <Typography variant="h6">Visibility & Permissions</Typography>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <Select
            value={visibility}
            onChange={(e) => {
              void handleVisibilityChange(
                e.target.value as 'public' | 'private',
              )
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
                <TableCell
                  colSpan={3}
                  align="center"
                  sx={{ color: 'text.secondary' }}
                >
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
            value={
              usersWithoutPermission.find((u) => u._id === selectedUserId) ??
              null
            }
            onChange={(_event, newValue) => {
              setSelectedUserId(newValue?._id ?? '')
            }}
            renderInput={(params) => <TextField {...params} label="User" />}
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

interface CheckType {
  _id: string
  name: string
  version: number
  causes: string[]
  isDefault: boolean
}

interface CheckResult {
  _id: string
  name: string
  cause: string
  featureId: string
  start: number
  end: number
  message: string
  ignored: boolean
}

function ChecksSection({
  assemblyId,
  assembly,
  currentUser,
  onUpdated,
}: {
  assemblyId: string
  assembly: Assembly
  currentUser?: User
  onUpdated: (updated: Assembly) => void
}) {
  const [checkTypes, setCheckTypes] = useState<CheckType[]>([])
  const [checkResults, setCheckResults] = useState<CheckResult[]>([])
  const [enabledChecks, setEnabledChecks] = useState<string[]>(
    assembly.checks ?? [],
  )
  const [checksError, setChecksError] = useState<string>()
  const [saving, setSaving] = useState(false)

  const isAdmin = currentUser?.role === 'admin'

  const loadChecks = useCallback(async () => {
    try {
      setChecksError(undefined)
      const [types, results] = await Promise.all([
        fetchJson<CheckType[]>('/checks/types').catch(() => [] as CheckType[]),
        fetchJson<CheckResult[]>(`/checks?assembly=${assemblyId}`).catch(
          () => [] as CheckResult[],
        ),
      ])
      setCheckTypes(types)
      setCheckResults(results)
    } catch (error_) {
      setChecksError(error_ instanceof Error ? error_.message : String(error_))
    }
  }, [assemblyId])

  useEffect(() => {
    void loadChecks()
  }, [loadChecks])

  useEffect(() => {
    setEnabledChecks(assembly.checks ?? [])
  }, [assembly.checks])

  async function handleSaveChecks() {
    try {
      setSaving(true)
      setChecksError(undefined)
      const res = await fetch(`/assemblies/${assemblyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checks: enabledChecks }),
      })
      if (!res.ok) {
        throw new Error(`Failed: ${res.status}`)
      }
      onUpdated({ ...assembly, checks: enabledChecks })
    } catch (error_) {
      setChecksError(error_ instanceof Error ? error_.message : String(error_))
    } finally {
      setSaving(false)
    }
  }

  function handleToggleCheck(name: string, checked: boolean) {
    if (checked) {
      setEnabledChecks([...enabledChecks, name])
    } else {
      setEnabledChecks(enabledChecks.filter((c) => c !== name))
    }
  }

  return (
    <>
      <Typography variant="h6" sx={{ mt: 3, mb: 1 }}>
        Checks
      </Typography>

      {checksError ? (
        <Alert severity="error" sx={{ mb: 1 }}>
          {checksError}
        </Alert>
      ) : null}

      {isAdmin && checkTypes.length > 0 ? (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Enabled Checks
          </Typography>
          {checkTypes.map((ct) => (
            <FormControlLabel
              key={ct._id}
              control={
                <Checkbox
                  checked={enabledChecks.includes(ct.name)}
                  onChange={(_e, checked) => {
                    handleToggleCheck(ct.name, checked)
                  }}
                />
              }
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {ct.name}
                  {ct.isDefault ? (
                    <Chip label="default" size="small" variant="outlined" />
                  ) : null}
                </Box>
              }
            />
          ))}
          <Box sx={{ mt: 1 }}>
            <Button
              variant="contained"
              size="small"
              disabled={saving}
              onClick={() => {
                void handleSaveChecks()
              }}
            >
              Save
            </Button>
          </Box>
        </Paper>
      ) : null}

      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Check Results
      </Typography>
      <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Check</TableCell>
              <TableCell>Cause</TableCell>
              <TableCell>Feature ID</TableCell>
              <TableCell>Message</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {checkResults.map((cr) => (
              <TableRow key={cr._id} hover>
                <TableCell>{cr.name}</TableCell>
                <TableCell>{cr.cause}</TableCell>
                <TableCell>
                  <Typography
                    variant="body2"
                    sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                  >
                    {cr.featureId}
                  </Typography>
                </TableCell>
                <TableCell>{cr.message}</TableCell>
              </TableRow>
            ))}
            {checkResults.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  align="center"
                  sx={{ color: 'text.secondary' }}
                >
                  No issues found
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  )
}

function AdminActionsSection({
  assemblyId,
  assembly,
  currentUser,
  onDeleted,
  onUpdated,
}: {
  assemblyId: string
  assembly: Assembly
  currentUser?: User
  onDeleted: () => void
  onUpdated: (updated: Assembly) => void
}) {
  const [aliasesText, setAliasesText] = useState(
    (assembly.aliases ?? []).join(', '),
  )
  const [actionError, setActionError] = useState<string>()
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (currentUser?.role !== 'admin') {
    return null
  }

  async function handleSaveAliases() {
    try {
      setActionError(undefined)
      const aliases = aliasesText
        .split(',')
        .map((a) => a.trim())
        .filter((a) => a.length > 0)
      const res = await fetch(`/assemblies/${assemblyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aliases }),
      })
      if (!res.ok) {
        throw new Error(`Failed: ${res.status}`)
      }
      onUpdated({ ...assembly, aliases })
    } catch (error_) {
      setActionError(error_ instanceof Error ? error_.message : String(error_))
    }
  }

  async function handleDelete() {
    try {
      setActionError(undefined)
      const res = await fetch(`/assemblies/${assemblyId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        throw new Error(`Failed: ${res.status}`)
      }
      onDeleted()
    } catch (error_) {
      setActionError(error_ instanceof Error ? error_.message : String(error_))
    }
  }

  return (
    <>
      <Typography variant="h6" sx={{ mt: 3, mb: 1 }}>
        Assembly Aliases
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 3 }}>
        <TextField
          size="small"
          label="Aliases (comma-separated)"
          value={aliasesText}
          onChange={(e) => {
            setAliasesText(e.target.value)
          }}
          sx={{ minWidth: 350 }}
        />
        <Button
          variant="contained"
          size="small"
          onClick={() => {
            void handleSaveAliases()
          }}
        >
          Save
        </Button>
      </Box>

      {actionError ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {actionError}
        </Alert>
      ) : null}

      <Typography variant="h6" sx={{ mt: 3, mb: 1, color: 'error.main' }}>
        Danger Zone
      </Typography>
      <Paper variant="outlined" sx={{ p: 2, borderColor: 'error.main' }}>
        <Typography variant="body2" sx={{ mb: 1 }}>
          Deleting an assembly permanently removes all its data including
          features, reference sequences, and check results.
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
            Delete Assembly
          </Button>
        )}
      </Paper>
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
      const [assemblyData, refSeqData, trackData, userData] = await Promise.all(
        [
          fetchJson<Assembly>(`/assemblies/${assemblyId}`),
          fetchJson<RefSeq[]>(`/refSeqs?assembly=${assemblyId}`),
          fetchJson<TrackConfig[]>(`/tracks?assembly=${assemblyId}`),
          fetchJson<User>('/users/me').catch(() => undefined),
        ],
      )
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
              <>
                <ChecksSection
                  assemblyId={assemblyId}
                  assembly={assembly}
                  currentUser={currentUser}
                  onUpdated={(updated) => {
                    setAssembly(updated)
                  }}
                />
                <PermissionsSection
                  assemblyId={assemblyId}
                  currentUser={currentUser}
                />
                <AdminActionsSection
                  assemblyId={assemblyId}
                  assembly={assembly}
                  currentUser={currentUser}
                  onDeleted={() => {
                    globalThis.location.href = '/ui/assemblies/'
                  }}
                  onUpdated={(updated) => {
                    setAssembly(updated)
                  }}
                />
              </>
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
