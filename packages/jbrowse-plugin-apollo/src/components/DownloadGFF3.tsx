/* eslint-disable @typescript-eslint/unbound-method */

/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/no-misused-promises */
import type { ApolloAssembly } from '@apollo-annotation/mst'
import { annotationFeatureToGFF3 } from '@apollo-annotation/shared'
import { type GFF3Item, formatSync } from '@gmod/gff'
import type { Assembly } from '@jbrowse/core/assemblyManager/assembly'
import { getConf } from '@jbrowse/core/configuration'
import { type IMSTMap, getSnapshot } from '@jbrowse/mobx-state-tree'
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
import { saveAs } from 'file-saver'
import React, { useState } from 'react'

import type {
  CollaborationServerDriver,
  InMemoryFileDriver,
} from '../BackendDrivers'
import type { ApolloSessionModel } from '../session'
import { createFetchErrorMessage, getBaseURL } from '../util'

import { Dialog } from './Dialog'

interface DownloadGFF3Props {
  session: ApolloSessionModel
  handleClose(): void
}

export function DownloadGFF3({ handleClose, session }: DownloadGFF3Props) {
  const [includeFASTA, setincludeFASTA] = useState(false)
  const [selectedAssembly, setSelectedAssembly] = useState<Assembly>()
  const [errorMessage, setErrorMessage] = useState('')

  const baseURL = getBaseURL(session)

  const { collaborationServerDriver, inMemoryFileDriver } =
    session.apolloDataStore as {
      collaborationServerDriver: CollaborationServerDriver
      inMemoryFileDriver: InMemoryFileDriver
    }
  const assemblies = [
    ...collaborationServerDriver.getAssemblies(),
    ...inMemoryFileDriver.getAssemblies(),
  ]

  function handleChangeAssembly(e: SelectChangeEvent) {
    const newAssembly = assemblies.find((asm) => asm.name === e.target.value)
    setSelectedAssembly(newAssembly)
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')
    if (!selectedAssembly) {
      setErrorMessage('Must select assembly to download')
      return
    }

    const metadata = getConf(selectedAssembly, ['sequence', 'metadata']) as {
      apollo?: boolean
    }
    if (metadata?.apollo) {
      await exportFromCollaborationServer()
    } else {
      exportFromMemory(session)
    }
    handleClose()
  }

  async function exportFromCollaborationServer() {
    if (!selectedAssembly) {
      setErrorMessage('Must select assembly to download')
      return
    }
    const url = new URL('export/getID', baseURL)
    const searchParams = new URLSearchParams({
      assembly: selectedAssembly.name,
    })
    url.search = searchParams.toString()
    const uri = url.toString()
    const response = await fetch(uri)
    if (!response.ok) {
      const newErrorMessage = await createFetchErrorMessage(
        response,
        'Error when exporting ID',
      )
      setErrorMessage(newErrorMessage)
      return
    }
    const { exportID } = (await response.json()) as { exportID: string }

    const exportURL = new URL('export', baseURL)
    const params: Record<string, string> = {
      exportID,
      includeFASTA: includeFASTA ? 'true' : 'false',
    }
    const exportSearchParams = new URLSearchParams(params)
    exportURL.search = exportSearchParams.toString()
    const exportUri = exportURL.toString()

    const exportResponse = await fetch(exportUri)
    if (!exportResponse.ok) {
      const newErrorMessage = await createFetchErrorMessage(
        exportResponse,
        'Error when exporting GFF3',
      )
      setErrorMessage(newErrorMessage)
      return
    }
    const blob = await exportResponse.blob()
    const assemblyName = selectedAssembly.displayName ?? selectedAssembly.name
    saveAs(blob, `${assemblyName}_apollo.gff3`)
  }

  function exportFromMemory(session: ApolloSessionModel) {
    if (!selectedAssembly) {
      setErrorMessage('Must select assembly to download')
      return
    }
    const { assemblies } = session.apolloDataStore as {
      assemblies: IMSTMap<typeof ApolloAssembly>
    }
    const assembly = assemblies.get(selectedAssembly.name)
    const refSeqs = assembly?.refSeqs
    if (!refSeqs) {
      setErrorMessage(
        `No refSeqs found for assembly "${selectedAssembly.name}"`,
      )
      return
    }
    const gff3Items: GFF3Item[] = [{ directive: 'gff-version', value: '3' }]
    const sequenceFeatures = getConf(selectedAssembly, [
      'sequence',
      'adapter',
      'features',
    ]) as { refName: string; start: number; end: number; seq: string }[]
    for (const sequenceFeature of sequenceFeatures) {
      const { end, refName, start } = sequenceFeature
      gff3Items.push({
        directive: 'sequence-region',
        value: `${refName} ${start + 1} ${end}`,
      })
    }
    for (const [, refSeq] of refSeqs) {
      const { features } = refSeq
      if (!features) {
        continue
      }
      for (const [, feature] of features) {
        gff3Items.push(annotationFeatureToGFF3(getSnapshot(feature)))
      }
    }
    for (const sequenceFeature of sequenceFeatures) {
      const { refName, seq } = sequenceFeature
      gff3Items.push({ id: refName, description: '', sequence: seq })
    }
    const gff3 = formatSync(gff3Items)
    const gff3Blob = new Blob([gff3], { type: 'text/plain;charset=utf-8' })
    saveAs(
      gff3Blob,
      `${selectedAssembly.displayName ?? selectedAssembly.name}.gff3`,
    )
  }

  return (
    <Dialog
      open
      title="Export GFF3"
      handleClose={handleClose}
      maxWidth={false}
      data-testid="download-gff3"
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
                {option.displayName ?? option.name}
              </MenuItem>
            ))}
          </Select>
          <DialogContentText>
            Select assembly to export to GFF3
          </DialogContentText>

          <FormGroup>
            <FormControlLabel
              data-testid="include-fasta-checkbox"
              control={
                <Checkbox
                  checked={includeFASTA}
                  onChange={() => {
                    setincludeFASTA(!includeFASTA)
                  }}
                />
              }
              label="Include fasta sequence in GFF output"
            />
          </FormGroup>
        </DialogContent>
        <DialogActions>
          <Button
            disabled={!selectedAssembly}
            variant="contained"
            type="submit"
          >
            Download
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
