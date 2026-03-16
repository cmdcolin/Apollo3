import {
  Button,
  DialogActions,
  DialogContent,
  DialogContentText,
} from '@mui/material'
import React from 'react'

import type { ApolloSessionModel } from '../session'

import { Dialog } from './Dialog'

interface LogOutProps {
  session: ApolloSessionModel
  handleClose(): void
}

export function LogOut({ handleClose, session: _session }: LogOutProps) {
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    document.cookie =
      'apollo-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
    globalThis.location.reload()
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
          <Button variant="outlined" type="submit" onClick={handleClose}>
            Cancel
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
