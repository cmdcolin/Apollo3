import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Select from '@mui/material/Select'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
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

  const isSelf = (userId: string) =>
    currentUser?.email === users.find((u) => u._id === userId)?.email

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
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Total: {users.length}
        </Typography>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Username</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Created</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u._id} hover>
                  <TableCell>{u.username}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <Select
                      size="small"
                      value={u.role}
                      disabled={isSelf(u._id)}
                      onChange={(e) => {
                        void handleRoleChange(u._id, e.target.value)
                      }}
                      sx={{ minWidth: 120 }}
                    >
                      <MenuItem value="admin">Admin</MenuItem>
                      <MenuItem value="user">User</MenuItem>
                      <MenuItem value="readOnly">Read Only</MenuItem>
                      <MenuItem value="none">None</MenuItem>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {u.createdAt ? new Date(u.createdAt).toLocaleString() : ''}
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      color="error"
                      disabled={isSelf(u._id)}
                      onClick={() => {
                        void handleDelete(u._id)
                      }}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {users.length === 0 && !error && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    align="center"
                    sx={{ color: 'text.secondary' }}
                  >
                    No users found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Container>
    </AdminNav>
  )
}

const root = document.querySelector('#root')
if (root) {
  createRoot(root).render(<UsersPage />)
}
