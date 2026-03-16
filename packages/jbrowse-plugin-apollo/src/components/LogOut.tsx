import {
  Button,
  DialogActions,
  DialogContent,
  DialogContentText,
} from '@mui/material'
import React from 'react'

import type { ApolloSessionModel } from '../session'
import { getBaseURL } from '../util'

import { Dialog } from './Dialog'

interface LogOutProps {
  session: ApolloSessionModel
  handleClose(): void
}

export function LogOut({ handleClose, session }: LogOutProps) {
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const baseURL = getBaseURL(session)
    const logoutUrl = new URL('auth/logout', baseURL)
    globalThis.location.href = logoutUrl.toString()
  }

  return (
    <Dialog
      open
      title="Log out"
      handleClose={handleClose}
      maxWidth={false}
      data-testid="log-out"
    >
      <form onSubmit={onSubmit}>
        <DialogContent style={{ display: 'flex', flexDirection: 'column' }}>
          <DialogContentText>
            Are you sure you want to log out?
          </DialogContentText>
        </DialogContent>

        <DialogActions>
          <Button variant="contained" type="submit">
            Log Out
          </Button>
          <Button variant="outlined" onClick={handleClose}>
            Cancel
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
