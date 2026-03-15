/* eslint-disable @typescript-eslint/unbound-method */

import type { AnnotationFeature } from '@apollo-annotation/mst'
import {
  SetCdsBoundsChange,
  buildExonMappings,
  findLongestOrf,
  splicedToGenomic,
} from '@apollo-annotation/shared'
import { defaultCodonTable, revcom } from '@jbrowse/core/util'
import {
  Button,
  DialogActions,
  DialogContent,
  DialogContentText,
  Typography,
} from '@mui/material'
import React, { useMemo } from 'react'

import type { ChangeManager } from '../ChangeManager'
import type { ApolloSessionModel } from '../session'

import { Dialog } from './Dialog'

interface SetLongestOrfProps {
  session: ApolloSessionModel
  handleClose(): void
  sourceFeature: AnnotationFeature
  sourceAssemblyId: string
  changeManager: ChangeManager
  refName: string
}

interface OrfResult {
  cdsMin: number
  cdsMax: number
  codons: number
  protein: string
}

function getSplicedSequence(
  exons: AnnotationFeature[],
  strand: number,
  getSequence: (min: number, max: number) => string,
) {
  const sorted = [...exons].sort((a, b) =>
    strand === -1 ? b.max - a.max : a.min - b.min,
  )
  let spliced = ''
  for (const exon of sorted) {
    let seq = getSequence(exon.min, exon.max)
    if (strand === -1) {
      seq = revcom(seq)
    }
    spliced += seq
  }
  return spliced
}

function translateOrf(sequence: string) {
  let protein = ''
  for (let i = 0; i + 2 < sequence.length; i += 3) {
    const codon = sequence.slice(i, i + 3).toUpperCase()
    const aa = defaultCodonTable[codon as keyof typeof defaultCodonTable]
    protein += aa
  }
  return protein
}

function OrfResultDisplay({ orfResult }: { orfResult: OrfResult }) {
  return (
    <>
      <DialogContentText>
        Found longest ORF: {orfResult.codons} codons (
        {orfResult.cdsMax - orfResult.cdsMin} bp genomic span)
      </DialogContentText>
      <Typography
        variant="body2"
        sx={{ mt: 1, fontFamily: 'monospace', wordBreak: 'break-all' }}
      >
        {orfResult.protein.length > 100
          ? `${orfResult.protein.slice(0, 50)}...${orfResult.protein.slice(-50)}`
          : orfResult.protein}
      </Typography>
      <DialogContentText sx={{ mt: 1 }}>
        Genomic coordinates: {orfResult.cdsMin.toLocaleString()}&ndash;
        {orfResult.cdsMax.toLocaleString()}
      </DialogContentText>
    </>
  )
}

export function SetLongestOrf({
  changeManager,
  handleClose,
  refName,
  session,
  sourceAssemblyId,
  sourceFeature,
}: SetLongestOrfProps) {
  const strand = sourceFeature.strand ?? 1
  const currentAssembly =
    session.apolloDataStore.assemblies.get(sourceAssemblyId)
  const refData = currentAssembly?.getByRefName(refName)

  const exons = useMemo(() => {
    const result: AnnotationFeature[] = []
    if (sourceFeature.children) {
      for (const [, child] of sourceFeature.children) {
        if (child.type === 'exon') {
          result.push(child)
        }
      }
    }
    return result
  }, [sourceFeature])

  const cdsChildren = useMemo(() => {
    const result: AnnotationFeature[] = []
    if (sourceFeature.children) {
      for (const [, child] of sourceFeature.children) {
        if (child.type === 'CDS') {
          result.push(child)
        }
      }
    }
    return result
  }, [sourceFeature])

  const orfResult = useMemo(() => {
    if (!refData || exons.length === 0) {
      return null
    }
    const getSequence = (min: number, max: number) =>
      refData.getSequence(min, max)

    const splicedSeq = getSplicedSequence(exons, strand, getSequence)
    if (splicedSeq.length === 0) {
      return null
    }
    const orf = findLongestOrf(splicedSeq)
    if (!orf) {
      return null
    }
    const mappings = buildExonMappings(exons, strand)
    const genomicStart = splicedToGenomic(orf.splicedStart, mappings, strand)
    const genomicEnd = splicedToGenomic(orf.splicedEnd, mappings, strand)
    const cdsMin = Math.min(genomicStart, genomicEnd)
    const cdsMax = Math.max(genomicStart, genomicEnd)
    const orfSequence = splicedSeq.slice(orf.splicedStart, orf.splicedEnd)
    const protein = translateOrf(orfSequence)
    return { cdsMin, cdsMax, codons: Math.floor(orf.length / 3), protein }
  }, [refData, exons, strand])

  function handleSubmit() {
    if (!orfResult || cdsChildren.length === 0) {
      return
    }
    const [cds] = cdsChildren

    const change = new SetCdsBoundsChange({
      typeName: 'SetCdsBoundsChange',
      changedIds: [cds._id],
      assembly: sourceAssemblyId,
      featureId: cds._id,
      oldMin: cds.min,
      newMin: orfResult.cdsMin,
      oldMax: cds.max,
      newMax: orfResult.cdsMax,
    })
    void changeManager.submit(change)
    handleClose()
  }

  const hasCds = cdsChildren.length > 0
  const hasSequence = Boolean(refData)
  const hasExons = exons.length > 0
  const canApply = orfResult && hasCds

  let statusMessage: string | null = null
  if (!hasSequence) {
    statusMessage =
      'Sequence data is not loaded. Please scroll to the transcript region first.'
  } else if (!hasExons) {
    statusMessage = 'This transcript has no exons.'
  } else if (!hasCds) {
    statusMessage =
      'This transcript has no CDS feature. Please add a CDS child first.'
  } else if (!orfResult) {
    statusMessage = 'No open reading frame found in this transcript.'
  }

  return (
    <Dialog
      open
      title="Set Longest ORF"
      handleClose={handleClose}
      data-testid="set-longest-orf"
    >
      <DialogContent>
        {statusMessage ? (
          <DialogContentText>{statusMessage}</DialogContentText>
        ) : null}
        {orfResult ? <OrfResultDisplay orfResult={orfResult} /> : null}
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={handleClose}>
          Cancel
        </Button>
        <Button variant="contained" disabled={!canApply} onClick={handleSubmit}>
          Apply
        </Button>
      </DialogActions>
    </Dialog>
  )
}
