import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
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
  createdAt?: string
}

const ROOT_USER_EMAIL = 'root_user'

function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [currentUser, setCurrentUser] = useState<User>()
  const [error, setError] = useState<string>()

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
      width: 100,
      sortable: false,
      align: 'right',
      headerAlign: 'right',
      renderCell: (params) => {
        const isRestricted =
          params.row.email === currentUser?.email ||
          params.row.email === ROOT_USER_EMAIL
        return (
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
        )
      },
    },
  ]

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
