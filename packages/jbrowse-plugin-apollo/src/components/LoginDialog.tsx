/* eslint-disable @typescript-eslint/no-misused-promises */
import {
  Button,
  DialogContent,
  DialogContentText,
  LinearProgress,
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
}

export function LoginDialog({ handleClose, session }: LoginDialogProps) {
  const baseURL = getBaseURL(session)
  const [loginTypes, setLoginTypes] = useState<LoginTypes>({ oidc: [] })
  const [errorMessage, setErrorMessage] = useState('')
  const [loading, setLoading] = useState(true)

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
        {!loading && loginTypes.oidc.length === 0 && !errorMessage ? (
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
        {errorMessage ? (
          <DialogContentText color="error">{errorMessage}</DialogContentText>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
