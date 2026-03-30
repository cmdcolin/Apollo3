import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { AdminNav } from './Nav.js'
import { fetchJson } from './fetchUtil.js'

interface User {
  _id: string
  username: string
  email: string
  role: string
  pendingApproval?: boolean
  createdAt?: string
}

const ROOT_USER_EMAIL = 'root_user'

function CreateUserDialog({
  onCreated,
  onClose,
}: {
  onCreated: () => void
  onClose: () => void
}) {
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [role, setRole] = useState('user')
  const [inviteLink, setInviteLink] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  async function handleCreate() {
    setError('')
    const res = await fetch('/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, username, role }),
    })
    if (!res.ok) {
      const data = (await res.json()) as { message?: string }
      setError(data.message ?? `Failed: ${res.status}`)
      return
    }
    const data = (await res.json()) as { inviteToken: string }
    const link = `${globalThis.location.origin}/ui/invite/?token=${data.inviteToken}`
    setInviteLink(link)
    onCreated()
  }

  if (inviteLink) {
    return (
      <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>Invite Link</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Send this link to <strong>{email}</strong>. They will use it to set
            their password.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField
              fullWidth
              size="small"
              value={inviteLink}
              slotProps={{ input: { readOnly: true } }}
            />
            <Tooltip title={copied ? 'Copied!' : 'Copy'}>
              <IconButton
                onClick={() => {
                  navigator.clipboard.writeText(inviteLink)
                  setCopied(true)
                  setTimeout(() => {
                    setCopied(false)
                  }, 2000)
                }}
                size="small"
              >
                {copied ? '\u2713' : '\u2398'}
              </IconButton>
            </Tooltip>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Done</Button>
        </DialogActions>
      </Dialog>
    )
  }

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create User</DialogTitle>
      <DialogContent
        sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}
      >
        {error ? <Alert severity="error">{error}</Alert> : null}
        <TextField
          label="Email"
          type="email"
          size="small"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
          }}
          required
        />
        <TextField
          label="Username"
          size="small"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value)
          }}
          required
        />
        <Select
          size="small"
          value={role}
          onChange={(e) => {
            setRole(e.target.value)
          }}
        >
          <MenuItem value="admin">Admin</MenuItem>
          <MenuItem value="user">User</MenuItem>
          <MenuItem value="readOnly">Read Only</MenuItem>
        </Select>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleCreate}
          disabled={!email || !username}
        >
          Create & Generate Invite
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [currentUser, setCurrentUser] = useState<User>()
  const [error, setError] = useState<string>()
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  const load = useCallback(async () => {
    try {
      setError(undefined)
      const [allUsers, me] = await Promise.all([
        fetchJson<User[]>('/users'),
        fetchJson<User>('/users/me').catch(() => {
          // non-critical
        }),
      ])
      setUsers(allUsers)
      setCurrentUser(me)
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleRoleChange(userId: string, newRole: string) {
    try {
      setError(undefined)
      const res = await fetch(`/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      })
      if (!res.ok) {
        throw new Error(`Failed: ${res.status}`)
      }
      setUsers((prev) =>
        prev.map((u) => (u._id === userId ? { ...u, role: newRole } : u)),
      )
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_))
    }
  }

  async function handleDelete(userId: string) {
    if (!globalThis.confirm('Delete this user?')) {
      return
    }
    try {
      setError(undefined)
      const res = await fetch(`/users/${userId}`, { method: 'DELETE' })
      if (!res.ok) {
        throw new Error(`Failed: ${res.status}`)
      }
      setUsers((prev) => prev.filter((u) => u._id !== userId))
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_))
    }
  }

  async function handleReinvite(userId: string) {
    try {
      setError(undefined)
      const res = await fetch(`/users/${userId}/reinvite`, { method: 'POST' })
      if (!res.ok) {
        throw new Error(`Failed: ${res.status}`)
      }
      const data = (await res.json()) as { inviteToken: string }
      const link = `${globalThis.location.origin}/ui/invite/?token=${data.inviteToken}`
      await navigator.clipboard.writeText(link)
      globalThis.alert('Invite link copied to clipboard')
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_))
    }
  }

  const columns: GridColDef<User>[] = [
    { field: 'username', headerName: 'Username', flex: 1 },
    { field: 'email', headerName: 'Email', flex: 1.5 },
    {
      field: 'role',
      headerName: 'Role',
      width: 160,
      renderCell: (params) => {
        const isRestricted =
          params.row.email === currentUser?.email ||
          params.row.email === ROOT_USER_EMAIL
        return (
          <Select
            size="small"
            value={params.row.role}
            disabled={isRestricted}
            onChange={(e) => {
              void handleRoleChange(params.row._id, e.target.value)
            }}
            sx={{ minWidth: 120 }}
          >
            <MenuItem value="admin">Admin</MenuItem>
            <MenuItem value="user">User</MenuItem>
            <MenuItem value="readOnly">Read Only</MenuItem>
            <MenuItem value="none">None</MenuItem>
          </Select>
        )
      },
    },
    {
      field: 'createdAt',
      headerName: 'Created',
      flex: 1,
      valueFormatter: (value: string | undefined) =>
        value ? new Date(value).toLocaleString() : '',
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 180,
      sortable: false,
      align: 'right',
      headerAlign: 'right',
      renderCell: (params) => {
        const isRestricted =
          params.row.email === currentUser?.email ||
          params.row.email === ROOT_USER_EMAIL
        return (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            {!isRestricted ? (
              <Button
                size="small"
                onClick={() => {
                  void handleReinvite(params.row._id)
                }}
              >
                Reinvite
              </Button>
            ) : null}
            <Button
              size="small"
              color="error"
              disabled={isRestricted}
              onClick={() => {
                void handleDelete(params.row._id)
              }}
            >
              Delete
            </Button>
          </Box>
        )
      },
    },
  ]

  const pendingCount = users.filter((u) => u.pendingApproval === true).length

  return (
    <AdminNav current="users">
      <Container>
        <Typography variant="h4" gutterBottom>
          Users
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
          <Button
            variant="contained"
            onClick={() => {
              setShowCreateDialog(true)
            }}
          >
            Create User
          </Button>
        </Box>
        {showCreateDialog ? (
          <CreateUserDialog
            onCreated={() => {
              void load()
            }}
            onClose={() => {
              setShowCreateDialog(false)
            }}
          />
        ) : null}
        {pendingCount > 0 ? (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {pendingCount} user{pendingCount === 1 ? '' : 's'} pending approval
            —{' '}
            <a href="/admin/approve-users/">review now</a>
          </Alert>
        ) : null}
        <Box sx={{ height: 500 }}>
          <DataGrid
            rows={users.map((u) => ({ ...u, id: u._id }))}
            columns={columns}
            density="compact"
            pageSizeOptions={[25, 50, 100]}
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          />
        </Box>
      </Container>
    </AdminNav>
  )
}

const root = document.querySelector('#root')
if (root) {
  createRoot(root).render(<UsersPage />)
}
