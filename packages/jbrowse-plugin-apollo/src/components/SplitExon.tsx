/* eslint-disable @typescript-eslint/unbound-method */

import type {
  AnnotationFeature,
  AnnotationFeatureSnapshot,
} from '@apollo-annotation/mst'
import { getSnapshot } from '@jbrowse/mobx-state-tree'
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

interface SplitExonProps {
  session: ApolloSessionModel
  handleClose(): void
  sourceFeature: AnnotationFeature
  sourceAssemblyId: string
  featureService: FeatureService
  selectedFeature?: AnnotationFeature
  setSelectedFeature(feature?: AnnotationFeature): void
}

interface splittableExon {
  isSplittable: boolean
  comment: string
}

function exonIsSplittable(
  exonToBeSplit: AnnotationFeatureSnapshot,
): splittableExon {
  if (exonToBeSplit.max - exonToBeSplit.min < 2) {
    return {
      isSplittable: false,
      comment: 'This exon is too short to be split',
    }
  }
  return { isSplittable: true, comment: '' }
}

function makeDialogText(splitExon: AnnotationFeatureSnapshot): string {
  const splittable = exonIsSplittable(splitExon)
  if (splittable.isSplittable) {
    return 'Are you sure you want to split the selected exon?'
  }
  return splittable.comment
}

export function SplitExon({
  featureService,
  handleClose,
  selectedFeature,
  setSelectedFeature,
  sourceFeature,
}: SplitExonProps) {
  const [errorMessage, setErrorMessage] = useState('')

  const exonToBeSplit = getSnapshot(sourceFeature)

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')
    if (selectedFeature?._id === sourceFeature._id) {
      setSelectedFeature()
    }

    const midpoint =
      exonToBeSplit.min + (exonToBeSplit.max - exonToBeSplit.min) / 2

    void featureService.splitExon(sourceFeature._id, midpoint)
    handleClose()
    event.preventDefault()
  }

  return (
    <Dialog
      open
      title="Split exon"
      handleClose={handleClose}
      maxWidth={false}
      data-testid="split-exon"
    >
      <form onSubmit={onSubmit}>
        <DialogContent style={{ display: 'flex', flexDirection: 'column' }}>
          <DialogContentText>{makeDialogText(exonToBeSplit)}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            variant="contained"
            type="submit"
            disabled={!exonIsSplittable(exonToBeSplit).isSplittable}
          >
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
