import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Container from '@mui/material/Container'
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

function ApproveUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [error, setError] = useState<string>()

  const load = useCallback(async () => {
    try {
      setError(undefined)
      const allUsers = await fetchJson<User[]>('/users')
      setUsers(allUsers.filter((u) => u.pendingApproval === true))
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleApprove(userId: string) {
    try {
      setError(undefined)
      const res = await fetch(`/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'user' }),
      })
      if (!res.ok) {
        throw new Error(`Failed: ${res.status}`)
      }
      setUsers((prev) => prev.filter((u) => u._id !== userId))
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_))
    }
  }

  async function handleReject(userId: string) {
    if (!globalThis.confirm('Remove this user account?')) {
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
      field: 'createdAt',
      headerName: 'Registered',
      flex: 1,
      valueFormatter: (value: string | undefined) =>
        value ? new Date(value).toLocaleString() : '',
    },
    {
      field: 'actions',
      headerName: '',
      width: 180,
      sortable: false,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            size="small"
            variant="contained"
            color="success"
            onClick={() => {
              void handleApprove(params.row._id)
            }}
          >
            Approve
          </Button>
          <Button
            size="small"
            color="error"
            onClick={() => {
              void handleReject(params.row._id)
            }}
          >
            Reject
          </Button>
        </Box>
      ),
    },
  ]

  return (
    <AdminNav current="approve-users">
      <Container>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Typography variant="h4">Approve Users</Typography>
          {users.length > 0 ? (
            <Chip label={users.length} size="small" color="warning" />
          ) : null}
        </Box>
        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}
        {users.length === 0 ? (
          <Alert severity="success">No users are pending approval.</Alert>
        ) : (
          <>
            <Alert severity="info" sx={{ mb: 2 }}>
              These users have registered and are waiting for access. Approve to
              grant full user access, or Reject to remove their account.
              Approved users must log out and back in for the change to take
              effect.
            </Alert>
            <Box sx={{ height: Math.min(200 + users.length * 36, 500) }}>
              <DataGrid
                rows={users.map((u) => ({ ...u, id: u._id }))}
                columns={columns}
                density="compact"
                pageSizeOptions={[25, 50]}
                initialState={{
                  sorting: {
                    sortModel: [{ field: 'createdAt', sort: 'desc' }],
                  },
                  pagination: { paginationModel: { pageSize: 25 } },
                }}
              />
            </Box>
          </>
        )}
      </Container>
    </AdminNav>
  )
}

const root = document.querySelector('#root')
if (root) {
  createRoot(root).render(<ApproveUsersPage />)
}
