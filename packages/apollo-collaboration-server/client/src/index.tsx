import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import { createJBrowseTheme } from '@jbrowse/core/ui/theme'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import Alert from '@mui/material/Alert'
import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Divider from '@mui/material/Divider'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Paper from '@mui/material/Paper'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'

import logoUrl from './apollo_logo.svg'

const theme = createJBrowseTheme({
  palette: {
    primary: { main: '#0c4f4b' },
    secondary: { main: '#1AA39B' },
  },
})

interface CurrentUser {
  username: string
  email: string
  role: string
}

function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [checked, setChecked] = useState(false)
  const [httpStatus, setHttpStatus] = useState<number>()

  useEffect(() => {
    fetch('/users/me')
      .then((r) => {
        setHttpStatus(r.status)
        if (r.ok) {
          return r.json()
        }
        return null
      })
      .then((data) => {
        setUser(data)
        setChecked(true)
      })
      .catch((e) => {
        console.error('Failed to fetch current user:', e)
        setChecked(true)
      })
  }, [])

  return { user, checked, httpStatus }
}

function useLoginTypes() {
  const [types, setTypes] = useState<string[]>([])

  useEffect(() => {
    fetch('/auth/types')
      .then((r) => r.json())
      .then(setTypes)
      .catch((e) => console.error('Failed to fetch login types:', e))
  }, [])

  return types
}

function useAdminContact() {
  const [adminEmail, setAdminEmail] = useState<string>()

  useEffect(() => {
    fetch('/users/admin')
      .then((r) => {
        if (r.ok) {
          return r.json()
        }
        return null
      })
      .then((data) => {
        if (data?.email) {
          setAdminEmail(data.email)
        }
      })
      .catch(() => {})
  }, [])

  return adminEmail
}

function Header({ user }: { user?: CurrentUser | null }) {
  return (
    <AppBar position="static" color="secondary" sx={{ mb: 3 }}>
      <Toolbar variant="dense">
        <Box
          component="a"
          href="/"
          sx={{
            display: 'flex',
            alignItems: 'center',
            mr: 1,
            textDecoration: 'none',
          }}
        >
          <img src={logoUrl} alt="Apollo" height={28} />
        </Box>
        <Typography
          variant="h6"
          component="a"
          href="/"
          sx={{
            textDecoration: 'none',
            color: 'inherit',
            fontSize: '1rem',
            flexGrow: 1,
          }}
        >
          Apollo
        </Typography>
        {user && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="body2">{user.username}</Typography>
            <Button color="inherit" size="small" href="/auth/logout">
              Sign out
            </Button>
          </Box>
        )}
      </Toolbar>
    </AppBar>
  )
}

function LoginSection() {
  const types = useLoginTypes()
  const currentUrl = window.location.href

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="h6">Sign in</Typography>
      {types.includes('google') && (
        <Button
          variant="contained"
          fullWidth
          href={`/auth/login?type=google&redirect_uri=${encodeURIComponent(currentUrl)}`}
        >
          Sign in with Google
        </Button>
      )}
      {types.includes('microsoft') && (
        <Button
          variant="contained"
          fullWidth
          href={`/auth/login?type=microsoft&redirect_uri=${encodeURIComponent(currentUrl)}`}
        >
          Sign in with Microsoft
        </Button>
      )}
      {types.includes('guest') && (
        <Button variant="outlined" fullWidth href="/auth/guest">
          Continue as Guest
        </Button>
      )}
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
        {adminEmail && adminEmail !== 'root_user' && (
          <>
            {' '}
            Contact <strong>{adminEmail}</strong> to request access.
          </>
        )}
      </Typography>
    </Box>
  )
}

function LoggedInContent({ user }: { user: CurrentUser }) {
  return (
    <Box>
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
        {user.role === 'admin' && (
          <>
            <Divider sx={{ my: 1 }} />
            <ListItemButton component="a" href="/admin/users/">
              <ListItemText primary="Manage Users" />
            </ListItemButton>
          </>
        )}
      </List>
    </Box>
  )
}

function IndexPage() {
  const { user, checked, httpStatus } = useCurrentUser()

  if (!checked) {
    return null
  }

  const isUnauthenticated =
    !user && (httpStatus === 401 || httpStatus === undefined)
  const isPendingApproval = user?.role === 'none'

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Header user={user} />
      <Container maxWidth="sm" sx={{ mt: 4, textAlign: 'center' }}>
        <Typography variant="h4" gutterBottom>
          {isUnauthenticated
            ? 'Welcome to Apollo'
            : `Welcome, ${user?.username}`}
        </Typography>
        <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 4 }}>
          Collaborative genome annotation editor
        </Typography>
        <Paper variant="outlined" sx={{ p: 3 }}>
          {isUnauthenticated && <LoginSection />}
          {user && isPendingApproval && <PendingApproval user={user} />}
          {user && !isPendingApproval && <LoggedInContent user={user} />}
        </Paper>
      </Container>
    </ThemeProvider>
  )
}

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(<IndexPage />)
}
