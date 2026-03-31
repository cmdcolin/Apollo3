import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Container from '@mui/material/Container'
import FormControlLabel from '@mui/material/FormControlLabel'
import Paper from '@mui/material/Paper'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import useSWR from 'swr'

import { Nav } from './Nav.js'
import { fetchJson } from './fetchUtil.js'
import { useCurrentUser } from './hooks.js'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/>
    </svg>
  )
}

function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
      <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
      <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path fill="currentColor" d="M12 0C5.37 0 0 5.37 0 12c0 5.303 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.606-.015 2.898-.015 3.293 0 .322.216.694.825.576C20.565 21.795 24 17.298 24 12c0-6.63-5.37-12-12-12z"/>
    </svg>
  )
}

function getProviderIcon(name: string) {
  const lower = name.toLowerCase()
  if (lower.includes('google')) {
    return <GoogleIcon />
  }
  if (lower.includes('microsoft') || lower.includes('azure') || lower.includes('entra')) {
    return <MicrosoftIcon />
  }
  if (lower.includes('github')) {
    return <GitHubIcon />
  }
  return null
}

interface OidcProviderInfo {
  name: string
  displayName: string
}

interface LoginTypes {
  oidc: OidcProviderInfo[]
  passwordLogin?: boolean
}

async function parseErrorMessage(response: Response) {
  const text = await response.text()
  try {
    const json = JSON.parse(text) as { message?: string }
    return json.message ?? text
  } catch {
    return text || `Request failed (${response.status})`
  }
}

function getReturnUrl() {
  const returnUrl = sessionStorage.getItem('apollo-return-url')
  sessionStorage.removeItem('apollo-return-url')
  if (returnUrl && returnUrl.startsWith('/')) {
    return returnUrl
  }
  return '/'
}

function SetupSection({ oidc }: { oidc: OidcProviderInfo[] }) {
  const currentUrl = globalThis.location.href
  const hasOidc = oidc.length > 0
  const [method, setMethod] = useState<'oauth' | 'local' | ''>(
    hasOidc ? '' : 'local',
  )
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')

  async function handleSetupAccount() {
    setError('')
    if (!email.trim() || !username.trim()) {
      setError('Email and display name are required')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    const response = await fetch('/auth/setup-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        email: email.trim(),
        username: username.trim(),
        password,
      }),
    })
    if (response.ok) {
      globalThis.location.href = getReturnUrl()
    } else {
      setError(await parseErrorMessage(response))
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="h6">Create admin account</Typography>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ textAlign: 'left' }}
      >
        No admin account exists yet. Create the first admin account to get
        started.
      </Typography>

      {hasOidc ? (
        <RadioGroup
          value={method}
          onChange={(e) => {
            setMethod(e.target.value as 'oauth' | 'local' | '')
            setError('')
          }}
        >
          <FormControlLabel
            value="oauth"
            control={<Radio />}
            label="Create admin via OAuth (recommended — supports 2FA)"
          />
          <FormControlLabel
            value="local"
            control={<Radio />}
            label="Create a local account with email and password"
          />
        </RadioGroup>
      ) : null}

      {method === 'oauth' ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {oidc.map((provider) => (
            <Button
              key={provider.name}
              variant="outlined"
              fullWidth
              href={`/auth/oidc/${provider.name}?redirect_uri=${encodeURIComponent(currentUrl)}`}
              startIcon={getProviderIcon(provider.name)}
              sx={{
                backgroundColor: '#fff',
                borderColor: '#dadce0',
                color: '#3c4043',
                justifyContent: 'flex-start',
                gap: 0.5,
                px: 2,
                '&:hover': { backgroundColor: '#f8f9fa', borderColor: '#dadce0' },
              }}
            >
              Sign in using {provider.displayName}
            </Button>
          ))}
        </Box>
      ) : method === 'local' ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <TextField
            label="Email"
            type="email"
            size="small"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setError('')
            }}
          />
          <TextField
            label="Display name"
            size="small"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value)
              setError('')
            }}
          />
          <TextField
            label="Password"
            type="password"
            size="small"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setError('')
            }}
          />
          <TextField
            label="Confirm password"
            type="password"
            size="small"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value)
              setError('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                handleSetupAccount()
              }
            }}
          />
          <Button
            variant="contained"
            disabled={!email.trim() || !username.trim() || !password}
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            onClick={() => handleSetupAccount()}
          >
            Create admin account
          </Button>
        </Box>
      ) : null}
    </Box>
  )
}

function LoginSection() {
  const { data: loginTypes, error: typesError, isLoading } = useSWR<LoginTypes>('/auth/types', fetchJson)
  const { data: setupData } = useSWR<{ active: boolean }>('/auth/setup-active', fetchJson)
  const oidc = loginTypes?.oidc ?? []
  const passwordLogin = loginTypes?.passwordLogin
  const setupActive = setupData?.active ?? false
  const currentUrl = globalThis.location.href
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
      globalThis.location.href = getReturnUrl()
    } else {
      setLoginError('Invalid email or password')
    }
  }

  if (isLoading) {
    return (
      <Box sx={{ textAlign: 'center', py: 3 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (typesError) {
    return (
      <Alert severity="error">
        Failed to load login methods: {String(typesError)}
      </Alert>
    )
  }

  if (setupActive) {
    return <SetupSection oidc={oidc} />
  }

  const hasOidc = oidc.length > 0
  const hasAnyMethod = hasOidc || passwordLogin

  const passwordForm = (
    <>
      {loginError ? <Alert severity="error">{loginError}</Alert> : null}
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
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            handlePasswordLogin()
          }
        }}
      />
      <Button
        variant="contained"
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        onClick={() => handlePasswordLogin()}
      >
        Sign in
      </Button>
    </>
  )

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="h6">Sign in</Typography>

      {oidc.map((provider) => (
        <Button
          key={provider.name}
          variant="outlined"
          fullWidth
          href={`/auth/oidc/${provider.name}?redirect_uri=${encodeURIComponent(currentUrl)}`}
          startIcon={getProviderIcon(provider.name)}
          sx={{
            backgroundColor: '#fff',
            borderColor: '#dadce0',
            color: '#3c4043',
            justifyContent: 'flex-start',
            gap: 0.5,
            px: 2,
            '&:hover': { backgroundColor: '#f8f9fa', borderColor: '#dadce0' },
          }}
        >
          Sign in using {provider.displayName}
        </Button>
      ))}

      {passwordLogin ? (
        hasOidc ? (
          showPasswordForm ? (
            passwordForm
          ) : (
            <Button
              variant="outlined"
              fullWidth
              onClick={() => {
                setShowPasswordForm(true)
              }}
              sx={{
                backgroundColor: '#fff',
                borderColor: '#dadce0',
                color: '#3c4043',
                justifyContent: 'flex-start',
                px: 2,
                '&:hover': { backgroundColor: '#f8f9fa', borderColor: '#dadce0' },
              }}
            >
              Sign in with password
            </Button>
          )
        ) : (
          passwordForm
        )
      ) : null}

      {!hasAnyMethod ? (
        <Typography variant="body2" color="text.secondary">
          No login providers configured. Contact your administrator.
        </Typography>
      ) : null}
    </Box>
  )
}

function SignInPage() {
  const { user, checked } = useCurrentUser()

  useEffect(() => {
    if (user) {
      globalThis.location.href = getReturnUrl()
    }
  }, [user])

  if (!checked || user) {
    return (
      <Nav>
        <Container maxWidth="xs" sx={{ mt: 4, textAlign: 'center' }}>
          <CircularProgress />
        </Container>
      </Nav>
    )
  }

  return (
    <Nav>
      <Container maxWidth="xs" sx={{ mt: 4, textAlign: 'center' }}>
        <Typography variant="h4" gutterBottom>
          Welcome to Apollo
        </Typography>
        <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 4 }}>
          Collaborative genome annotation editor
        </Typography>
        <Paper variant="outlined" sx={{ p: 3 }}>
          <LoginSection />
        </Paper>
      </Container>
    </Nav>
  )
}

const root = document.querySelector('#root')
if (root) {
  createRoot(root).render(<SignInPage />)
}
