import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Container from '@mui/material/Container'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Paper from '@mui/material/Paper'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
function VisibilityIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
    </svg>
  )
}

function VisibilityOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>
    </svg>
  )
}
import type React from 'react'
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

function PasswordField(
  props: Omit<React.ComponentProps<typeof TextField>, 'type'>,
) {
  const [show, setShow] = useState(false)
  return (
    <TextField
      {...props}
      type={show ? 'text' : 'password'}
      InputProps={{
        ...props.InputProps,
        endAdornment: (
          <InputAdornment position="end">
            <IconButton
              aria-label={show ? 'Hide password' : 'Show password'}
              onClick={() => {
                setShow((s) => !s)
              }}
              edge="end"
              size="small"
            >
              {show ? (
                <VisibilityOffIcon />
              ) : (
                <VisibilityIcon />
              )}
            </IconButton>
          </InputAdornment>
        ),
      }}
    />
  )
}

const oidcButtonSx = {
  backgroundColor: '#fff',
  borderColor: '#dadce0',
  color: '#3c4043',
  justifyContent: 'flex-start',
  gap: 0.5,
  px: 2,
  '&:hover': { backgroundColor: '#f8f9fa', borderColor: '#dadce0' },
}

function OidcButton({
  provider,
  redirectUri,
}: {
  provider: OidcProviderInfo
  redirectUri: string
}) {
  return (
    <Button
      variant="outlined"
      fullWidth
      href={`/auth/oidc/${provider.name}?redirect_uri=${encodeURIComponent(redirectUri)}`}
      startIcon={getProviderIcon(provider.name)}
      sx={oidcButtonSx}
    >
      Sign in using {provider.displayName}
    </Button>
  )
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
            <OidcButton
              key={provider.name}
              provider={provider}
              redirectUri={currentUrl}
            />
          ))}
        </Box>
      ) : method === 'local' ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <TextField
            label="Email"
            type="email"
            size="small"
            autoComplete="email"
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
          <PasswordField
            label="Password"
            size="small"
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setError('')
            }}
          />
          <PasswordField
            label="Confirm password"
            size="small"
            autoComplete="new-password"
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

function PasswordLoginForm({
  email,
  password,
  loginError,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: {
  email: string
  password: string
  loginError: string
  onEmailChange: (v: string) => void
  onPasswordChange: (v: string) => void
  onSubmit: () => void
}) {
  return (
    <>
      {loginError ? <Alert severity="error">{loginError}</Alert> : null}
      <TextField
        label="Email"
        type="email"
        size="small"
        autoComplete="email"
        value={email}
        onChange={(e) => {
          onEmailChange(e.target.value)
        }}
      />
      <PasswordField
        label="Password"
        size="small"
        autoComplete="current-password"
        value={password}
        onChange={(e) => {
          onPasswordChange(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onSubmit()
          }
        }}
      />
      <Button variant="contained" onClick={onSubmit}>
        Sign in
      </Button>
    </>
  )
}

function LoginSection() {
  const { data: loginTypes, error: typesError, isLoading } =
    useSWR<LoginTypes>('/auth/types', fetchJson)
  const { data: setupData } = useSWR<{ active: boolean }>(
    '/auth/setup-active',
    fetchJson,
  )
  const oidc = loginTypes?.oidc ?? []
  const passwordLogin = loginTypes?.passwordLogin
  const setupActive = setupData?.active ?? false
  const hasOidc = oidc.length > 0
  const hasAnyMethod = hasOidc || passwordLogin
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

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {isLoading ? (
        <Box sx={{ textAlign: 'center', py: 3 }}>
          <CircularProgress />
        </Box>
      ) : typesError ? (
        <Alert severity="error">
          Failed to load login methods: {String(typesError)}
        </Alert>
      ) : setupActive ? (
        <SetupSection oidc={oidc} />
      ) : (
        <>
          <Typography variant="h6">Sign in</Typography>
          {oidc.map((provider) => (
            <OidcButton
              key={provider.name}
              provider={provider}
              redirectUri={currentUrl}
            />
          ))}
          {passwordLogin ? (
            hasOidc && !showPasswordForm ? (
              <Button
                variant="outlined"
                fullWidth
                onClick={() => {
                  setShowPasswordForm(true)
                }}
                sx={oidcButtonSx}
              >
                Sign in with password
              </Button>
            ) : (
              <PasswordLoginForm
                email={email}
                password={password}
                loginError={loginError}
                onEmailChange={(v) => {
                  setEmail(v)
                  setLoginError('')
                }}
                onPasswordChange={(v) => {
                  setPassword(v)
                  setLoginError('')
                }}
                onSubmit={handlePasswordLogin}
              />
            )
          ) : null}
          {!hasAnyMethod ? (
            <Typography variant="body2" color="text.secondary">
              No login providers configured. Contact your administrator.
            </Typography>
          ) : null}
        </>
      )}
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

  return (
    <Nav>
      <Container maxWidth="xs" sx={{ mt: 4, textAlign: 'center' }}>
        {!checked || user ? (
          <CircularProgress />
        ) : (
          <>
            <Typography variant="h4" gutterBottom>
              Welcome to Apollo
            </Typography>
            <Typography
              variant="subtitle1"
              color="text.secondary"
              sx={{ mb: 4 }}
            >
              Collaborative genome annotation editor
            </Typography>
            <Paper variant="outlined" sx={{ p: 3 }}>
              <LoginSection />
            </Paper>
          </>
        )}
      </Container>
    </Nav>
  )
}

const root = document.querySelector('#root')
if (root) {
  createRoot(root).render(<SignInPage />)
}
