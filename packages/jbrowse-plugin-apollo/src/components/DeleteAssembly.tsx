/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-misused-promises */
import { DeleteAssemblyChange } from '@apollo-annotation/shared'
import {
  Button,
  Checkbox,
  DialogActions,
  DialogContent,
  DialogContentText,
  FormControlLabel,
  FormGroup,
  MenuItem,
  Select,
  type SelectChangeEvent,
} from '@mui/material'
import React, { useState } from 'react'

import type { CollaborationServerDriver } from '../BackendDrivers'
import type { ChangeManager } from '../ChangeManager'
import type { ApolloSessionModel } from '../session'

import { Dialog } from './Dialog'

interface DeleteAssemblyProps {
  session: ApolloSessionModel
  handleClose(): void
  changeManager: ChangeManager
}

export function DeleteAssembly({
  changeManager,
  handleClose,
  session,
}: DeleteAssemblyProps) {
  const [errorMessage, setErrorMessage] = useState('')
  const [confirmDelete, setconfirmDelete] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const { collaborationServerDriver } = session.apolloDataStore as {
    collaborationServerDriver: CollaborationServerDriver
  }

  const assemblies = collaborationServerDriver.getAssemblies()
  const [selectedAssembly, setSelectedAssembly] = useState(assemblies.at(0))

  function handleChangeAssembly(e: SelectChangeEvent) {
    const newAssembly = assemblies.find((asm) => asm.name === e.target.value)
    setSelectedAssembly(newAssembly)
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted(true)
    setErrorMessage('')
    if (!selectedAssembly) {
      setErrorMessage('Must select assembly!')
      return
    }
    const change = new DeleteAssemblyChange({
      typeName: 'DeleteAssemblyChange',
      assembly: selectedAssembly.name,
    })
    await changeManager.submit(change)
    handleClose()
    event.preventDefault()
  }

  return (
    <Dialog
      open
      title="Delete Assembly"
      handleClose={handleClose}
      maxWidth={false}
      data-testid="delete-assembly"
    >
      <form onSubmit={onSubmit}>
        <DialogContent style={{ display: 'flex', flexDirection: 'column' }}>
          <DialogContentText>Select assembly</DialogContentText>
          <Select
            labelId="label"
            value={selectedAssembly?.name ?? ''}
            onChange={handleChangeAssembly}
            disabled={assemblies.length === 0}
          >
            {assemblies.map((option) => (
              <MenuItem key={option.name} value={option.name}>
                {option.displayName}
              </MenuItem>
            ))}
          </Select>
          <DialogContentText>
            <strong style={{ color: 'red' }}>
              NOTE: All assembly data will be deleted and this operation cannot
              be undone!
            </strong>
          </DialogContentText>
          <FormGroup>
            <FormControlLabel
              control={
                <Checkbox
                  checked={confirmDelete}
                  onChange={() => {
                    setconfirmDelete(!confirmDelete)
                  }}
                />
              }
              label="I understand that all assembly data will be deleted"
            />
          </FormGroup>
        </DialogContent>

        <DialogActions>
          <Button
            disabled={!selectedAssembly || !confirmDelete}
            variant="contained"
            type="submit"
          >
            Delete
          </Button>
          <Button variant="outlined" type="submit" onClick={handleClose}>
            Cancel
          </Button>
        </DialogActions>
      </form>
      {errorMessage ? (
        <DialogContent>
          <DialogContentText color="error">{errorMessage}</DialogContentText>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
