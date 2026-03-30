import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Container from '@mui/material/Container'
import Link from '@mui/material/Link'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { Nav } from './Nav.js'

const jsonHeaders = { Accept: 'application/json' }

interface CurrentUser {
  username: string
  email: string
  role: string
  pendingApproval?: boolean
  needsRelogin?: boolean
}

function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    fetch('/users/me', { headers: jsonHeaders })
      .then((r) => {
        if (r.ok) {
          return r.json() as Promise<CurrentUser>
        }
        return null
      })
      .then((data) => {
        setUser(data)
        setChecked(true)
      })
      .catch((error: unknown) => {
        console.error('Failed to fetch current user:', error)
        setChecked(true)
      })
  }, [])

  return { user, checked }
}

function useAdminContact() {
  const [adminEmail, setAdminEmail] = useState<string>()

  useEffect(() => {
    fetch('/users/admin', { headers: jsonHeaders })
      .then((r) => {
        if (r.ok) {
          return r.json() as Promise<{ email: string }>
        }
        return null
      })
      .then((data) => {
        if (data?.email) {
          setAdminEmail(data.email)
        }
      })
      .catch(() => {
        /* ignore */
      })
  }, [])

  return adminEmail
}

function PendingApproval({ user }: { user: CurrentUser }) {
  const adminEmail = useAdminContact()

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        Your account ({user.email}) is pending approval.
      </Alert>
      <Typography variant="body2" sx={{ mb: 2 }}>
        An administrator needs to assign you a role before you can access
        Apollo.
        {adminEmail ? (
          <>
            {' '}
            Contact <strong>{adminEmail}</strong> to request access.
          </>
        ) : null}
      </Typography>
    </Box>
  )
}

function useUserStats(isAdmin: boolean) {
  const [stats, setStats] = useState<{ active: number; total: number }>()

  useEffect(() => {
    if (!isAdmin) {
      return
    }
    fetch('/users/stats', { headers: jsonHeaders })
      .then((r) => {
        if (r.ok) {
          return r.json() as Promise<{ active: number; total: number }>
        }
        return null
      })
      .then((data) => {
        if (data) {
          setStats(data)
        }
      })
      .catch(() => {
        /* ignore */
      })
  }, [isAdmin])

  return stats
}

function usePendingCount(isAdmin: boolean) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!isAdmin) {
      return
    }
    fetch('/users/pending-count', { headers: jsonHeaders })
      .then((r) => {
        if (r.ok) {
          return r.json() as Promise<{ count: number }>
        }
        return null
      })
      .then((data) => {
        if (data) {
          setCount(data.count)
        }
      })
      .catch(() => {
        /* ignore */
      })
  }, [isAdmin])

  return count
}

function LoggedInContent({ user }: { user: CurrentUser }) {
  const isAdmin = user.role === 'admin'
  const stats = useUserStats(isAdmin)
  const pendingCount = usePendingCount(isAdmin)

  return (
    <Box>
      {stats ? (
        <Box
          sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mb: 1 }}
        >
          <Chip
            label={`${stats.active} active`}
            size="small"
            color="success"
            variant="outlined"
          />
          <Chip
            label={`${stats.total} registered`}
            size="small"
            variant="outlined"
          />
        </Box>
      ) : null}
      {pendingCount > 0 ? (
        <Alert severity="warning" sx={{ mb: 1, textAlign: 'left' }}>
          {pendingCount} user{pendingCount === 1 ? '' : 's'} pending approval.{' '}
          <Link href="/admin/approve-users/">Review now</Link>
        </Alert>
      ) : null}
      <List>
        <ListItemButton component="a" href="/ui/organisms/">
          <ListItemText primary="Organisms" />
        </ListItemButton>
        <ListItemButton component="a" href="/ui/assemblies/">
          <ListItemText primary="Assemblies" />
        </ListItemButton>
        <ListItemButton component="a" href="/ui/changes/">
          <ListItemText primary="Recent Changes" />
        </ListItemButton>
      </List>
    </Box>
  )
}

function IndexPage() {
  const { user, checked } = useCurrentUser()

  if (!checked) {
    return (
      <Nav>
        <Container maxWidth="xs" sx={{ mt: 4, textAlign: 'center' }}>
          <CircularProgress />
        </Container>
      </Nav>
    )
  }

  const isPendingApproval = user?.pendingApproval === true
  const isReadOnly = user?.role === 'readOnly' && !isPendingApproval

  return (
    <Nav>
      <Container maxWidth="xs" sx={{ mt: 4, textAlign: 'center' }}>
        <Typography variant="h4" gutterBottom>
          {user ? `Welcome, ${user.username}` : 'Welcome to Apollo'}
        </Typography>
        <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 4 }}>
          Collaborative genome annotation editor
        </Typography>
        {user?.needsRelogin ? (
          <Alert severity="success" sx={{ mb: 2, textAlign: 'left' }}>
            Your access has been updated to <strong>{user.role}</strong>. Sign
            out and back in to apply it.
          </Alert>
        ) : null}
        {isReadOnly ? (
          <Alert severity="info" sx={{ mb: 2, textAlign: 'left' }}>
            You have read-only access. Contact an admin to request write
            permissions.
          </Alert>
        ) : null}
        {user ? (
          <Paper variant="outlined" sx={{ p: 3 }}>
            {isPendingApproval ? (
              <PendingApproval user={user} />
            ) : (
              <LoggedInContent user={user} />
            )}
          </Paper>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Button variant="contained" fullWidth href="/ui/signin/">
              Sign in
            </Button>
            <Button variant="contained" color="secondary" fullWidth href="/ui/assemblies/">
              Browse public data
            </Button>
          </Box>
        )}
      </Container>
    </Nav>
  )
}

const root = document.querySelector('#root')
if (root) {
  createRoot(root).render(<IndexPage />)
}
