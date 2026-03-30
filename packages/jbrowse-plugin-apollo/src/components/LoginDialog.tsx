import {
  Button,
  DialogContent,
  DialogContentText,
  LinearProgress,
  TextField,
} from '@mui/material'
import React, { useEffect, useState } from 'react'

import type { ApolloSessionModel } from '../session'
import { getBaseURL } from '../util'

import { Dialog } from './Dialog'

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

interface LoginDialogProps {
  session: ApolloSessionModel
  handleClose: () => void
}

interface OidcProviderInfo {
  name: string
  displayName: string
}

interface LoginTypes {
  oidc: OidcProviderInfo[]
  passwordLogin?: boolean
}

export function LoginDialog({ handleClose, session }: LoginDialogProps) {
  const baseURL = getBaseURL(session)
  const [loginTypes, setLoginTypes] = useState<LoginTypes>({ oidc: [] })
  const [errorMessage, setErrorMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function fetchLoginTypes() {
      const url = new URL('auth/types', baseURL)
      const response = await fetch(url.toString())
      if (cancelled) {
        return
      }
      if (response.ok) {
        const types = (await response.json()) as LoginTypes
        setLoginTypes(types)
      } else {
        setErrorMessage('Could not fetch login options from server')
      }
      setLoading(false)
    }
    fetchLoginTypes().catch((error: unknown) => {
      if (!cancelled) {
        setErrorMessage(String(error))
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [baseURL])

  async function handlePasswordLogin() {
    setLoginError('')
    const url = new URL('auth/login', baseURL)
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      credentials: 'include',
    })
    if (response.ok) {
      globalThis.location.reload()
    } else {
      setLoginError('Invalid email or password')
    }
  }

  function handleOAuthLogin(providerName: string) {
    const redirectUri = globalThis.location.href
    const url = new URL(`auth/oidc/${providerName}`, baseURL)
    url.searchParams.set('redirect_uri', redirectUri)
    globalThis.location.href = url.toString()
  }

  const hasOidc = loginTypes.oidc.length > 0
  const hasPassword = loginTypes.passwordLogin
  const hasNoMethods = !loading && !hasOidc && !hasPassword && !errorMessage

  return (
    <Dialog
      open
      maxWidth="xs"
      title="Sign in to Apollo"
      handleClose={handleClose}
      data-testid="login-dialog"
    >
      <DialogContent
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          minWidth: 300,
        }}
      >
        {loading ? <LinearProgress /> : null}
        {hasNoMethods ? (
          <DialogContentText>
            No login methods are configured on this server.
          </DialogContentText>
        ) : null}
        {loginTypes.oidc.map((provider) => (
          <Button
            key={provider.name}
            variant="outlined"
            fullWidth
            onClick={() => {
              handleOAuthLogin(provider.name)
            }}
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
        {hasPassword ? (
          <>
            {loginError ? (
              <DialogContentText color="error">{loginError}</DialogContentText>
            ) : null}
            <TextField
              label="Email"
              type="email"
              size="small"
              value={loginEmail}
              onChange={(e) => {
                setLoginEmail(e.target.value)
                setLoginError('')
              }}
            />
            <TextField
              label="Password"
              type="password"
              size="small"
              value={loginPassword}
              onChange={(e) => {
                setLoginPassword(e.target.value)
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
              fullWidth
              onClick={() => {
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                handlePasswordLogin()
              }}
            >
              Sign in
            </Button>
          </>
        ) : null}
        {errorMessage ? (
          <DialogContentText color="error">{errorMessage}</DialogContentText>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
