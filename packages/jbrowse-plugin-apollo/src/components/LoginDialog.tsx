/* eslint-disable @typescript-eslint/no-misused-promises */
import {
  Button,
  DialogContent,
  DialogContentText,
  LinearProgress,
  TextField,
} from '@mui/material'
import React, { type FormEvent, useEffect, useState } from 'react'

import type { ApolloSessionModel } from '../session'
import { getBaseURL } from '../util'

import { Dialog } from './Dialog'

interface LoginDialogProps {
  session: ApolloSessionModel
  handleClose: () => void
}

export function LoginDialog({ handleClose, session }: LoginDialogProps) {
  const baseURL = getBaseURL(session)
  const [loginTypes, setLoginTypes] = useState<string[]>([])
  const [errorMessage, setErrorMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [rootPassword, setRootPassword] = useState('')

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

  async function handleRootLogin(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErrorMessage('')
    const url = new URL('auth/root', baseURL)
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: rootPassword }),
    })
    if (response.ok) {
      globalThis.location.reload()
    } else {
      setErrorMessage('Invalid password')
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
        {loginTypes.includes('root') ? (
          <form
            onSubmit={handleRootLogin}
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
          >
            <TextField
              label="Root password"
              type="password"
              size="small"
              fullWidth
              value={rootPassword}
              onChange={(e) => {
                setRootPassword(e.target.value)
              }}
            />
            <Button
              type="submit"
              variant="outlined"
              fullWidth
              disabled={loading || !rootPassword}
            >
              Sign in as Root
            </Button>
          </form>
        ) : null}
        {errorMessage ? (
          <DialogContentText color="error">{errorMessage}</DialogContentText>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
