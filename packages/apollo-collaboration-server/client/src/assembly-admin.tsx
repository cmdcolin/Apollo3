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
  aliases?: string[]
  visibility?: 'public' | 'private'
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
  if (
    parts.length >= 3 &&
    parts[0] === 'ui' &&
    parts[1] === 'assembly-admin'
  ) {
    return parts[2]
  }
}

type PermRow = AssemblyPermission & { id: string; username: string }

function AssemblyAdminPage() {
  const assemblyId = getAssemblyId()
  const [assembly, setAssembly] = useState<Assembly>()
  const [currentUser, setCurrentUser] = useState<User>()
  const [permissions, setPermissions] = useState<AssemblyPermission[]>([])
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedRole, setSelectedRole] = useState('readOnly')
  const [visibility, setVisibility] = useState<'public' | 'private'>('private')
  const [aliasesText, setAliasesText] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string>()

  const loadPermissions = useCallback(async () => {
    if (!assemblyId) {
      return
    }
    const perms = await fetchJson<AssemblyPermission[]>(
      `/assemblies/${assemblyId}/permissions`,
    ).catch(() => [] as AssemblyPermission[])
    setPermissions(perms)
  }, [assemblyId])

  const load = useCallback(async () => {
    if (!assemblyId) {
      setError('No assembly ID in URL')
      return
    }
    try {
      setError(undefined)
      const [assemblyData, userData, perms, users] = await Promise.all([
        fetchJson<Assembly>(`/assemblies/${assemblyId}`),
        fetchJson<User>('/users/me').catch(() => null),
        fetchJson<AssemblyPermission[]>(
          `/assemblies/${assemblyId}/permissions`,
        ).catch(() => [] as AssemblyPermission[]),
        fetchJson<User[]>('/users').catch(() => [] as User[]),
      ])
      if (!userData?.role || userData.role !== 'admin') {
        setError('Admin access required')
        return
      }
      setAssembly(assemblyData)
      setCurrentUser(userData)
      setPermissions(perms)
      setAllUsers(users)
      setVisibility(assemblyData.visibility ?? 'private')
      setAliasesText((assemblyData.aliases ?? []).join(', '))
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_))
    }
  }, [assemblyId])

  useEffect(() => {
    void load()
  }, [load])

  async function handleVisibilityChange(newVisibility: 'public' | 'private') {
    try {
      setError(undefined)
      await fetch(`/assemblies/${assemblyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: newVisibility }),
      })
      setVisibility(newVisibility)
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_))
    }
  }

  async function handleAddPermission() {
    if (!selectedUserId) {
      return
    }
    try {
      setError(undefined)
      await fetch(`/assemblies/${assemblyId}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUserId, role: selectedRole }),
      })
      setSelectedUserId('')
      await loadPermissions()
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_))
    }
  }

  async function handleRemovePermission(userId: string) {
    try {
      setError(undefined)
      await fetch(`/assemblies/${assemblyId}/permissions/${userId}`, {
        method: 'DELETE',
      })
      await loadPermissions()
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_))
    }
  }

  async function handleSaveAliases() {
    if (!assembly) {
      return
    }
    try {
      setError(undefined)
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
      setAssembly({ ...assembly, aliases })
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_))
    }
  }

  async function handleDelete() {
    try {
      setError(undefined)
      const res = await fetch(`/assemblies/${assemblyId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        throw new Error(`Failed: ${res.status}`)
      }
      globalThis.location.href = '/ui/assemblies/'
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_))
    }
  }

  const usernameMap = new Map(allUsers.map((u) => [u._id, u.username]))
  const usersWithoutPermission = allUsers.filter(
    (u) => u.role !== 'admin' && !permissions.some((p) => p.user === u._id),
  )
  const displayName = assembly?.displayName ?? assembly?.name ?? assemblyId

  const permColumns: GridColDef<PermRow>[] = [
    { field: 'username', headerName: 'User', flex: 1 },
    {
      field: 'role',
      headerName: 'Role',
      width: 130,
      renderCell: (params: GridRenderCellParams<PermRow, string>) => (
        <Chip label={params.value} size="small" variant="outlined" />
      ),
    },
    {
      field: 'actions',
      headerName: '',
      width: 100,
      sortable: false,
      renderCell: (params) => (
        <Button
          size="small"
          color="error"
          onClick={() => {
            void handleRemovePermission(params.row.user)
          }}
        >
          Remove
        </Button>
      ),
    },
  ]

  const permRows: PermRow[] = permissions.map((p) => ({
    ...p,
    id: p._id,
    username: usernameMap.get(p.user) ?? p.user,
  }))

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
            href={`/ui/assemblies/${assemblyId}`}
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

        {currentUser?.role === 'admin' && assembly ? (
          <>
            <Typography variant="h4" sx={{ mb: 3 }}>
              Admin — {displayName}
            </Typography>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
              <Typography variant="h6">Visibility & Permissions</Typography>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <Select
                  value={visibility}
                  onChange={(e) => {
                    void handleVisibilityChange(
                      e.target.value === 'public' ? 'public' : 'private',
                    )
                  }}
                >
                  <MenuItem value="public">Public</MenuItem>
                  <MenuItem value="private">Private</MenuItem>
                </Select>
              </FormControl>
            </Box>

            <Box sx={{ height: 300, mb: 2 }}>
              <DataGrid
                rows={permRows}
                columns={permColumns}
                density="compact"
                pageSizeOptions={[25]}
                hideFooter={permissions.length <= 25}
              />
            </Box>

            {usersWithoutPermission.length > 0 ? (
              <Box
                sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 4 }}
              >
                <Autocomplete
                  size="small"
                  sx={{ minWidth: 250 }}
                  options={usersWithoutPermission}
                  getOptionLabel={(u) => u.username}
                  value={
                    usersWithoutPermission.find(
                      (u) => u._id === selectedUserId,
                    ) ?? null
                  }
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

            <Typography variant="h6" sx={{ mb: 1 }}>
              Assembly Aliases
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 4 }}>
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

            <Typography variant="h6" sx={{ mb: 1, color: 'error.main' }}>
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
        ) : null}
      </Container>
    </Nav>
  )
}

const root = document.querySelector('#root')
if (root) {
  createRoot(root).render(<AssemblyAdminPage />)
}
