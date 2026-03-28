/* eslint-disable @typescript-eslint/no-misused-promises */
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
  rootLogin?: boolean
}

export function LoginDialog({ handleClose, session }: LoginDialogProps) {
  const baseURL = getBaseURL(session)
  const [loginTypes, setLoginTypes] = useState<LoginTypes>({ oidc: [] })
  const [errorMessage, setErrorMessage] = useState('')
  const [loading, setLoading] = useState(true)
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
  const isLocalhost =
    globalThis.location?.hostname === 'localhost' ||
    globalThis.location?.hostname === '127.0.0.1'
  const hasRoot = loginTypes.rootLogin && isLocalhost
  const hasNoMethods = !loading && !hasOidc && !hasRoot && !errorMessage

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
        {hasOidc && hasRoot ? <Divider /> : null}
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
