/* eslint-disable @typescript-eslint/unbound-method */

import type { AnnotationFeature } from '@apollo-annotation/mst'
import {
  Button,
  DialogActions,
  DialogContent,
  DialogContentText,
} from '@mui/material'
import React, { useState } from 'react'

import type { FeatureService } from '../FeatureService'
import type { ApolloSessionModel } from '../session'

import { Dialog } from './Dialog'

interface DeleteFeatureProps {
  session: ApolloSessionModel
  handleClose(): void
  sourceFeature: AnnotationFeature
  sourceAssemblyId: string
  featureService: FeatureService
  selectedFeature?: AnnotationFeature
  setSelectedFeature(feature?: AnnotationFeature): void
}

export function DeleteFeature({
  featureService,
  handleClose,
  selectedFeature,
  setSelectedFeature,
  sourceFeature,
}: DeleteFeatureProps) {
  const [errorMessage, setErrorMessage] = useState('')

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')
    if (selectedFeature?._id === sourceFeature._id) {
      setSelectedFeature()
    }

    try {
      await featureService.deleteFeature(sourceFeature._id)
      handleClose()
    } catch (error) {
      setErrorMessage(String(error))
    }
  }

  return (
    <Dialog
      open
      title="Delete feature"
      handleClose={handleClose}
      maxWidth={false}
      data-testid="delete-feature"
    >
      <form
        onSubmit={(event) => {
          void onSubmit(event)
        }}
      >
        <DialogContent style={{ display: 'flex', flexDirection: 'column' }}>
          <DialogContentText>
            Are you sure you want to delete the selected feature?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" type="submit">
            Yes
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
