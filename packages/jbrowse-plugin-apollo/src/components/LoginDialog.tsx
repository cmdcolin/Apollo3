import {
  Button,
  DialogContent,
  DialogContentText,
  Divider,
  LinearProgress,
  TextField,
} from '@mui/material'
import React, { useEffect, useState } from 'react'

import type { ApolloSessionModel } from '../session'
import { getBaseURL } from '../util'

import { Dialog } from './Dialog'

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
  rootLogin?: boolean
}

export function LoginDialog({ handleClose, session }: LoginDialogProps) {
  const baseURL = getBaseURL(session)
  const [loginTypes, setLoginTypes] = useState<LoginTypes>({ oidc: [] })
  const [errorMessage, setErrorMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [rootPassword, setRootPassword] = useState('')
  const [rootLoginError, setRootLoginError] = useState('')

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

  async function handleRootLogin() {
    setRootLoginError('')
    const url = new URL('auth/root', baseURL)
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: rootPassword }),
      credentials: 'include',
    })
    if (response.ok) {
      globalThis.location.reload()
    } else {
      setRootLoginError('Invalid password')
    }
  }

  const hasOidc = loginTypes.oidc.length > 0
  const hasPassword = loginTypes.passwordLogin
  const isLocalhost =
    globalThis.location?.hostname === 'localhost' ||
    globalThis.location?.hostname === '127.0.0.1'
  const hasRoot = loginTypes.rootLogin && isLocalhost
  const hasNoMethods =
    !loading && !hasOidc && !hasPassword && !hasRoot && !errorMessage

  return (
    <Dialog
      open
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
            variant="contained"
            fullWidth
            onClick={() => {
              handleOAuthLogin(provider.name)
            }}
          >
            Sign in with {provider.displayName}
          </Button>
        ))}
        {hasPassword ? (
          <>
            {hasOidc ? <Divider>or</Divider> : null}
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
        {(hasOidc || hasPassword) && hasRoot ? <Divider /> : null}
        {hasRoot ? (
          <>
            <TextField
              label="Root password"
              type="password"
              size="small"
              value={rootPassword}
              onChange={(e) => {
                setRootPassword(e.target.value)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleRootLogin()
                }
              }}
              error={!!rootLoginError}
              helperText={rootLoginError}
            />
            <Button
              variant="contained"
              fullWidth
              onClick={() => {
                handleRootLogin()
              }}
            >
              Sign in as Root
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
