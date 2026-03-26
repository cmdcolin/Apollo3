/* eslint-disable @typescript-eslint/no-misused-promises */
import type { AnnotationFeature } from '@apollo-annotation/mst'
import type { AbstractSessionModel } from '@jbrowse/core/util'
import { TextField, Typography } from '@mui/material'
import { observer } from 'mobx-react'
import React, { useState } from 'react'

import { isOntologyClass } from '../OntologyManager'
import type { OntologyLookup } from '../OntologyManager/OntologyLookup'
import { fetchValidDescendantTerms } from '../OntologyManager/util'
import { OntologyTermAutocomplete } from '../components/OntologyTermAutocomplete'
import type { ApolloSessionModel } from '../session'
import { isReadOnly } from '../util'

import { NumberTextField } from './NumberTextField'

function strandLabel(strand: 1 | -1 | undefined) {
  if (strand === 1) {
    return '+ (positive)'
  }
  if (strand === -1) {
    return '- (negative)'
  }
  return 'none'
}

const ReadOnlyBasicInformation = observer(function ReadOnlyBasicInformation({
  feature,
}: {
  feature: AnnotationFeature
}) {
  const { max, min, strand, type } = feature
  return (
    <div data-testid="basic_information">
      <Typography variant="body2">
        <strong>Start:</strong> {min + 1}
      </Typography>
      <Typography variant="body2">
        <strong>End:</strong> {max}
      </Typography>
      <Typography variant="body2">
        <strong>Type:</strong> {type}
      </Typography>
      <Typography variant="body2">
        <strong>Strand:</strong> {strandLabel(strand)}
      </Typography>
    </div>
  )
})

export const BasicInformation = observer(function BasicInformation({
  feature,
  session,
}: {
  feature: AnnotationFeature
  session: ApolloSessionModel
}) {
  if (isReadOnly(session)) {
    return <ReadOnlyBasicInformation feature={feature} />
  }
  return (
    <EditableBasicInformation
      feature={feature}
      session={session}
    />
  )
})

const EditableBasicInformation = observer(function EditableBasicInformation({
  feature,
  session,
}: {
  feature: AnnotationFeature
  session: ApolloSessionModel
}) {
  const [errorMessage, setErrorMessage] = useState('')
  const [typeWarningText, setTypeWarningText] = useState('')

  const { _id, max, min, strand, type } = feature

  const notifyError = (e: Error) => {
    ;(session as unknown as AbstractSessionModel).notify(e.message, 'error')
  }

  const { featureService } = session.apolloDataStore
  function handleTypeChange(newType: string) {
    setErrorMessage('')
    return featureService.updateFeature(_id, { type: newType })
  }

  function handleStrandChange(event: React.ChangeEvent<HTMLInputElement>) {
    const { value } = event.target
    const newStrand = value ? (Number(value) as 1 | -1) : undefined
    return featureService.updateFeature(_id, { strand: newStrand ?? null })
  }

  async function handleStartChange(newStart: number) {
    newStart--
    await featureService.updateFeature(_id, { min: newStart })
    return true
  }

  async function handleEndChange(newEnd: number) {
    await featureService.updateFeature(_id, { max: newEnd })
    return true
  }

  function fetchValidTerms(ontologyStore: OntologyLookup) {
    const terms = fetchValidDescendantTerms(feature, ontologyStore)
    if (!terms) {
      setTypeWarningText(
        `Type "${feature.type}" does not have any children in the ontology`,
      )
      return
    }
    return terms
  }

  return (
    <div data-testid="basic_information">
      <NumberTextField
        margin="dense"
        id="start"
        label="Start"
        fullWidth
        variant="outlined"
        value={min + 1}
        onChangeCommitted={handleStartChange}
      />
      <NumberTextField
        margin="dense"
        id="end"
        label="End"
        fullWidth
        variant="outlined"
        value={max}
        onChangeCommitted={handleEndChange}
      />
      <OntologyTermAutocomplete
        session={session}
        ontologyName="Sequence Ontology"
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
            handleTypeChange(newValue).catch(notifyError)
          }
        }}
      />
      <label>
        <input
          type="radio"
          value="1"
          checked={strand === 1}
          onChange={handleStrandChange}
        />
        Positive Strand (+)
      </label>
      <label>
        <input
          type="radio"
          value="-1"
          checked={strand === -1}
          onChange={handleStrandChange}
        />
        Negative Strand (-)
      </label>
      <label>
        <input
          type="radio"
          value=""
          checked={strand === undefined}
          onChange={handleStrandChange}
        />
        No Strand Information
      </label>
      {errorMessage ? (
        <Typography color="error">{errorMessage}</Typography>
      ) : null}
    </div>
  )
})
