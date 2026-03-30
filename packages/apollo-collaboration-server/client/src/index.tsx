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
import TextField from '@mui/material/TextField'
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

interface OidcProviderInfo {
  name: string
  displayName: string
}

interface LoginTypes {
  oidc: OidcProviderInfo[]
  passwordLogin?: boolean
  rootLogin?: boolean
}

function useLoginTypes() {
  const [types, setTypes] = useState<LoginTypes>({ oidc: [] })

  useEffect(() => {
    fetch('/auth/types', { headers: jsonHeaders })
      .then((r) => r.json() as Promise<LoginTypes>)
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
  const { oidc, passwordLogin, rootLogin } = useLoginTypes()
  const setupActive = useSetupActive()
  const currentUrl = globalThis.location.href
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rootPassword, setRootPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [showPasswordForm, setShowPasswordForm] = useState(false)

  async function handlePasswordLogin() {
    setLoginError('')
    const response = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    })
    if (response.ok) {
      globalThis.location.reload()
    } else {
      setLoginError('Invalid email or password')
    }
  }

  async function handleRootLogin() {
    setLoginError('')
    const response = await fetch('/auth/root', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ password: rootPassword }),
    })
    if (response.ok) {
      globalThis.location.reload()
    } else {
      setLoginError('Invalid password')
    }
  }

  const hasOidc = oidc.length > 0
  const hasAnyMethod = hasOidc || passwordLogin || rootLogin || setupActive
  const rootOnly = rootLogin && !hasOidc && !passwordLogin

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {setupActive ? (
        <Alert severity="success" sx={{ textAlign: 'left' }}>
          <strong>Admin setup mode active.</strong> Sign in below — the first
          account to log in will become the admin.
        </Alert>
      ) : null}
      <Typography variant="h6">Sign in</Typography>

      {rootOnly ? (
        <>
          <Typography variant="body2" color="text.secondary">
            Enter the root password to sign in as admin.
          </Typography>
          {loginError ? <Alert severity="error">{loginError}</Alert> : null}
          <TextField
            label="Root password"
            type="password"
            size="small"
            value={rootPassword}
            onChange={(e) => {
              setRootPassword(e.target.value)
              setLoginError('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                void handleRootLogin()
              }
            }}
          />
          <Button variant="contained" onClick={() => void handleRootLogin()}>
            Sign in
          </Button>
        </>
      ) : (
        <>
          {oidc.map((provider) => (
            <Button
              key={provider.name}
              variant="contained"
              fullWidth
              href={`/auth/oidc/${provider.name}?redirect_uri=${encodeURIComponent(currentUrl)}`}
            >
              Sign in with {provider.displayName}
            </Button>
          ))}

          {passwordLogin ? (
            showPasswordForm ? (
              <>
                {hasOidc ? <Divider>or</Divider> : null}
                {loginError ? (
                  <Alert severity="error">{loginError}</Alert>
                ) : null}
                <TextField
                  label="Email"
                  type="email"
                  size="small"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    setLoginError('')
                  }}
                />
                <TextField
                  label="Password"
                  type="password"
                  size="small"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setLoginError('')
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      void handlePasswordLogin()
                    }
                  }}
                />
                <Button
                  variant="contained"
                  onClick={() => void handlePasswordLogin()}
                >
                  Sign in
                </Button>
              </>
            ) : (
              <>
                {hasOidc ? <Divider>or</Divider> : null}
                <Button
                  variant="outlined"
                  fullWidth
                  onClick={() => {
                    setShowPasswordForm(true)
                  }}
                >
                  Sign in with password
                </Button>
              </>
            )
          ) : null}

          {rootLogin ? (
            <>
              <Divider />
              <Button variant="text" size="small" href="/admin/login/">
                Admin login
              </Button>
            </>
          ) : null}
        </>
      )}

      {!hasAnyMethod ? (
        <Typography variant="body2" color="text.secondary">
          No login providers configured. Contact your administrator.
        </Typography>
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
