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
  handleClose(): void
}

export function LoginDialog({ handleClose, session }: LoginDialogProps) {
  const baseURL = getBaseURL(session)
  const [loginTypes, setLoginTypes] = useState<string[]>([])
  const [errorMessage, setErrorMessage] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function fetchLoginTypes() {
      console.debug('[LoginDialog] fetchLoginTypes starting', { baseURL })
      const url = new URL('auth/types', baseURL)
      const response = await fetch(url.toString())
      if (cancelled) {
        console.debug(
          '[LoginDialog] fetchLoginTypes completed after cleanup — would have called setState on unmounted component.',
        )
        return
      }
      if (response.ok) {
        const types = (await response.json()) as string[]
        setLoginTypes(types)
      } else {
        setErrorMessage('Could not fetch login options from server')
      }
      setLoading(false)
    }
    fetchLoginTypes().catch((error) => {
      if (!cancelled) {
        setErrorMessage(String(error))
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [baseURL])

  async function handleGuestLogin() {
    setLoading(true)
    setErrorMessage('')
    const url = new URL('auth/guest', baseURL)
    const response = await fetch(url.toString())
    if (response.ok) {
      globalThis.location.reload()
    } else {
      setErrorMessage('Guest login failed')
      setLoading(false)
    }
  }

  function handleOAuthLogin(type: string) {
    const redirectUri = globalThis.location.href
    const url = new URL('auth/login', baseURL)
    url.searchParams.set('type', type)
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
        {!loading && loginTypes.length === 0 && !errorMessage ? (
          <DialogContentText>
            No login methods are configured on this server.
          </DialogContentText>
        ) : null}
        {loginTypes.includes('google') ? (
          <Button
            variant="contained"
            fullWidth
            onClick={() => {
              handleOAuthLogin('google')
            }}
          >
            Sign in with Google
          </Button>
        ) : null}
        {loginTypes.includes('microsoft') ? (
          <Button
            variant="contained"
            fullWidth
            onClick={() => {
              handleOAuthLogin('microsoft')
            }}
          >
            Sign in with Microsoft
          </Button>
        ) : null}
        {loginTypes.includes('guest') ? (
          <Button
            variant="outlined"
            fullWidth
            onClick={handleGuestLogin}
            disabled={loading}
          >
            Continue as Guest
          </Button>
        ) : null}
        {errorMessage ? (
          <DialogContentText color="error">{errorMessage}</DialogContentText>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
