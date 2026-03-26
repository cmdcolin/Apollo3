import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Container from '@mui/material/Container'
import Divider from '@mui/material/Divider'
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

function useLoginTypes() {
  const [types, setTypes] = useState<string[]>([])

  useEffect(() => {
    fetch('/auth/types', { headers: jsonHeaders })
      .then((r) => r.json() as Promise<string[]>)
      .then((data) => {
        setTypes(data)
      })
      .catch((error: unknown) => {
        console.error('Failed to fetch login types:', error)
      })
  }, [])

  return types
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

function useSetupActive() {
  const [active, setActive] = useState(false)

  useEffect(() => {
    fetch('/auth/setup-active', { headers: jsonHeaders })
      .then((r) => r.json() as Promise<{ active: boolean }>)
      .then((data) => {
        setActive(data.active)
      })
      .catch(() => {
        /* ignore */
      })
  }, [])

  return active
}

function LoginSection() {
  const types = useLoginTypes()
  const setupActive = useSetupActive()
  const currentUrl = globalThis.location.href

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {setupActive ? (
        <Alert severity="success" sx={{ textAlign: 'left' }}>
          <strong>Admin setup mode active.</strong> Sign in below — the first
          account to log in will become the admin.
        </Alert>
      ) : null}
      <Typography variant="h6">Sign in</Typography>
      {types.includes('google') ? (
        <Button
          variant="contained"
          fullWidth
          href={`/auth/login?type=google&redirect_uri=${encodeURIComponent(currentUrl)}`}
        >
          Sign in with Google
        </Button>
      ) : null}
      {types.includes('microsoft') ? (
        <Button
          variant="contained"
          fullWidth
          href={`/auth/login?type=microsoft&redirect_uri=${encodeURIComponent(currentUrl)}`}
        >
          Sign in with Microsoft
        </Button>
      ) : null}
      {types.includes('guest') ? (
        <Button
          variant="outlined"
          fullWidth
          href={`/auth/login?type=guest&redirect_uri=${encodeURIComponent(currentUrl)}`}
        >
          Continue as Guest
        </Button>
      ) : null}
    </Box>
  )
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
        {adminEmail && adminEmail !== 'root_user' ? (
          <>
            {' '}
            Contact <strong>{adminEmail}</strong> to request access.
          </>
        ) : null}
      </Typography>
    </Box>
  )
}

function useUserStats() {
  const [stats, setStats] = useState<{ active: number; total: number }>()

  useEffect(() => {
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
  }, [])

  return stats
}

function LoggedInContent({ user }: { user: CurrentUser }) {
  const stats = useUserStats()

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
        {user.role === 'admin' ? (
          <>
            <Divider sx={{ my: 1 }} />
            <ListItemButton component="a" href="/admin/users/">
              <ListItemText primary="Manage Users" />
            </ListItemButton>
            <ListItemButton component="a" href="/admin/approve-users/">
              <ListItemText primary="Approve Users" />
            </ListItemButton>
            <ListItemButton component="a" href="/admin/jobs/">
              <ListItemText primary="Analysis Jobs" />
            </ListItemButton>
            <ListItemButton component="a" href="/admin/add-assembly/">
              <ListItemText primary="Add Assembly" />
            </ListItemButton>
          </>
        ) : null}
      </List>
    </Box>
  )
}

function IndexPage() {
  const { user, checked } = useCurrentUser()

  if (!checked) {
    return null
  }

  const isPendingApproval = user?.pendingApproval === true
  const isReadOnly = user?.role === 'readOnly' && !isPendingApproval

  return (
    <Nav>
      <Container maxWidth="sm" sx={{ mt: 4, textAlign: 'center' }}>
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
        <Paper variant="outlined" sx={{ p: 3 }}>
          {user ? (
            isPendingApproval ? (
              <PendingApproval user={user} />
            ) : (
              <LoggedInContent user={user} />
            )
          ) : (
            <LoginSection />
          )}
        </Paper>
      </Container>
    </Nav>
  )
}

const root = document.querySelector('#root')
if (root) {
  createRoot(root).render(<IndexPage />)
}
