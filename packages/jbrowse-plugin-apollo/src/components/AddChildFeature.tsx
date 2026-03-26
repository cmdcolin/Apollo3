/* eslint-disable @typescript-eslint/unbound-method */

import { featureId } from '@apollo-annotation/common'
import type { AnnotationFeature } from '@apollo-annotation/mst'
import {
  Button,
  DialogActions,
  DialogContent,
  DialogContentText,
  TextField,
} from '@mui/material'
import React, { useState } from 'react'

import type { FeatureService } from '../FeatureService'
import { isOntologyClass } from '../OntologyManager'
import type { OntologyLookup } from '../OntologyManager/OntologyLookup'
import { fetchValidDescendantTerms } from '../OntologyManager/util'
import type { ApolloSessionModel } from '../session'

import { Dialog } from './Dialog'
import { OntologyTermAutocomplete } from './OntologyTermAutocomplete'

interface AddChildFeatureProps {
  session: ApolloSessionModel
  handleClose(): void
  sourceFeature: AnnotationFeature
  sourceAssemblyId: string
  featureService: FeatureService
}

export function AddChildFeature({
  featureService,
  handleClose,
  session,
  sourceAssemblyId,
  sourceFeature,
}: AddChildFeatureProps) {
  const [end, setEnd] = useState(String(sourceFeature.max))
  const [start, setStart] = useState(String(sourceFeature.min + 1))
  const [type, setType] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [typeWarningText, setTypeWarningText] = useState('')

  function fetchValidTerms(ontologyStore: OntologyLookup) {
    const terms = fetchValidDescendantTerms(sourceFeature, ontologyStore)
    if (!terms) {
      setTypeWarningText(
        `Type "${sourceFeature.type}" does not have any children in the ontology`,
      )
      return
    }
    return terms
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')
    const _id = featureId()
    void featureService.addFeature(
      {
        _id,
        refSeq: sourceFeature.refSeq,
        min: Number(start) - 1,
        max: Number(end),
        type,
      },
      sourceAssemblyId,
      sourceFeature._id,
    ).then(() => {
      session.apolloSetSelectedFeature(_id)
    })
    handleClose()
    event.preventDefault()
  }
  function handleChangeType(newType: string) {
    setErrorMessage('')
    setType(newType)
  }
  const error = Number(end) <= Number(start)
  return (
    <Dialog
      open
      title="Add new child feature"
      handleClose={handleClose}
      maxWidth={false}
      data-testid="add-feature-dialog"
    >
      <form onSubmit={onSubmit}>
        <DialogContent style={{ display: 'flex', flexDirection: 'column' }}>
          <TextField
            margin="dense"
            id="start"
            label="Start"
            type="number"
            fullWidth
            variant="outlined"
            value={start}
            onChange={(e) => {
              setStart(e.target.value)
            }}
          />
          <TextField
            margin="dense"
            id="end"
            label="End"
            type="number"
            fullWidth
            variant="outlined"
            value={end}
            onChange={(e) => {
              setEnd(e.target.value)
            }}
            error={error}
            helperText={error ? '"End" must be greater than "Start"' : null}
          />
          <OntologyTermAutocomplete
            session={session}
            ontologyName="Sequence Ontology"
            style={{ width: 170 }}
            value={type}
            filterTerms={isOntologyClass}
            fetchValidTerms={fetchValidTerms}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Type"
                variant="outlined"
                fullWidth
                error={Boolean(typeWarningText)}
                helperText={typeWarningText}
              />
            )}
            onChange={(oldValue, newValue) => {
              if (newValue) {
                handleChangeType(newValue)
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button
            variant="contained"
            type="submit"
            disabled={error || !(start && end && type)}
          >
            Submit
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
