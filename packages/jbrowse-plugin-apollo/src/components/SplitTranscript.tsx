/* eslint-disable @typescript-eslint/unbound-method */

import type {
  AnnotationFeature,
  Children,
} from '@apollo-annotation/mst'
import {
  Box,
  Button,
  DialogActions,
  DialogContent,
  DialogContentText,
  FormControl,
  FormControlLabel,
  Radio,
  RadioGroup,
  type SelectChangeEvent,
} from '@mui/material'
import React, { useState } from 'react'

import type { FeatureService } from '../FeatureService'
import type { ApolloSessionModel } from '../session'

import { Dialog } from './Dialog'

interface SplitTranscriptProps {
  session: ApolloSessionModel
  handleClose(): void
  sourceFeature: AnnotationFeature
  sourceAssemblyId: string
  featureService: FeatureService
  selectedFeature?: AnnotationFeature
  setSelectedFeature(feature?: AnnotationFeature): void
}

interface SplitPoint {
  position: number
  label: string
}

function getSortedExons(
  transcript: AnnotationFeature,
  session: ApolloSessionModel,
): AnnotationFeature[] {
  const exons: AnnotationFeature[] = []
  const transcriptChildren = transcript.children as Children
  if (transcriptChildren) {
    const { featureTypeOntology } = session.apolloDataStore.ontologyManager
    if (!featureTypeOntology) {
      return exons
    }
    for (const [, child] of transcriptChildren) {
      if (featureTypeOntology.isTypeOf(child.type, 'exon')) {
        exons.push(child)
      }
    }
  }
  exons.sort((a, b) => a.min - b.min)
  return exons
}

function getSplitPoints(
  transcript: AnnotationFeature,
  session: ApolloSessionModel,
): SplitPoint[] {
  const exons = getSortedExons(transcript, session)
  const splitPoints: SplitPoint[] = []
  for (let i = 0; i < exons.length - 1; i++) {
    const left = exons[i]
    const right = exons[i + 1]
    const position = (left.max + right.min) / 2
    splitPoints.push({
      position,
      label: `Between exon ${i + 1} (${left.min + 1}..${left.max}) and exon ${i + 2} (${right.min + 1}..${right.max})`,
    })
  }
  return splitPoints
}

function makeExonName(feature: AnnotationFeature): string {
  const name = feature.attributes.get('gff_name')?.join(',')
  const id = feature.attributes.get('gff_id')?.join(',')
  return name ?? id ?? feature._id
}

export function SplitTranscript({
  featureService,
  handleClose,
  selectedFeature,
  session,
  setSelectedFeature,
  sourceFeature,
}: SplitTranscriptProps) {
  const [errorMessage, setErrorMessage] = useState('')
  const splitPoints = getSplitPoints(sourceFeature, session)
  const [selectedSplitIdx, setSelectedSplitIdx] = useState(
    splitPoints.length > 0 ? 0 : undefined,
  )

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')
    if (selectedSplitIdx === undefined) {
      return
    }
    if (selectedFeature?._id === sourceFeature._id) {
      setSelectedFeature()
    }

    void featureService.splitTranscript(
      sourceFeature._id,
      splitPoints[selectedSplitIdx].position,
    )
    handleClose()
  }

  const handleChange = (e: SelectChangeEvent) => {
    setErrorMessage('')
    setSelectedSplitIdx(Number(e.target.value))
  }

  const transcriptName = makeExonName(sourceFeature)

  return (
    <Dialog
      open
      title="Split transcript"
      handleClose={handleClose}
      maxWidth={false}
      data-testid="split-transcript"
    >
      <form onSubmit={onSubmit}>
        <DialogContent style={{ display: 'flex', flexDirection: 'column' }}>
          {splitPoints.length === 0 ? (
            <DialogContentText>
              This transcript has fewer than 2 exons and cannot be split.
            </DialogContentText>
          ) : (
            <>
              <DialogContentText>
                Split transcript {transcriptName} at:
              </DialogContentText>
              <FormControl style={{ marginTop: 5 }}>
                <RadioGroup
                  name="split-point-group"
                  value={
                    selectedSplitIdx === undefined
                      ? ''
                      : String(selectedSplitIdx)
                  }
                  onChange={handleChange}
                >
                  {splitPoints.map((sp, idx) => (
                    <FormControlLabel
                      value={String(idx)}
                      key={sp.position}
                      control={<Radio />}
                      label={
                        <Box display="flex" alignItems="center">
                          {sp.label}
                        </Box>
                      }
                    />
                  ))}
                </RadioGroup>
              </FormControl>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            variant="contained"
            type="submit"
            disabled={
              splitPoints.length === 0 || selectedSplitIdx === undefined
            }
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
