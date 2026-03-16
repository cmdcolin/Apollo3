/* eslint-disable @typescript-eslint/use-unknown-in-catch-callback-variable */
/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-misused-promises */
import { AddFeaturesFromFileChange } from '@apollo-annotation/shared'
import type { Assembly } from '@jbrowse/core/assemblyManager/assembly'
import {
  Button,
  DialogActions,
  DialogContent,
  DialogContentText,
  MenuItem,
  Select,
  type SelectChangeEvent,
} from '@mui/material'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import LinearProgress from '@mui/material/LinearProgress'
import React, { useEffect, useState } from 'react'

import type { CollaborationServerDriver } from '../BackendDrivers'
import type { ChangeManager } from '../ChangeManager'
import type { ApolloSessionModel } from '../session'
import { apolloFetch, createFetchErrorMessage, getBaseURL } from '../util'

import { Dialog } from './Dialog'

interface ImportFeaturesProps {
  session: ApolloSessionModel
  handleClose(): void
  changeManager: ChangeManager
}

export function ImportFeatures({
  changeManager,
  handleClose,
  session,
}: ImportFeaturesProps) {
  const [file, setFile] = useState<File>()
  const [selectedAssembly, setSelectedAssembly] = useState<Assembly>()
  const [errorMessage, setErrorMessage] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [featuresCount, setFeaturesCount] = useState<number | undefined>()
  const [deleteFeatures, setDeleteFeatures] = useState(false)
  const [loading, setLoading] = useState(false)

  const baseURL = getBaseURL(session)

  const { collaborationServerDriver } = session.apolloDataStore as {
    collaborationServerDriver: CollaborationServerDriver
  }
  const assemblies = collaborationServerDriver.getAssemblies()

  function handleChangeAssembly(e: SelectChangeEvent) {
    const newAssembly = assemblies.find((asm) => asm.name === e.target.value)
    setSelectedAssembly(newAssembly)
    setSubmitted(false)
  }

  function handleDeleteFeatures(e: React.ChangeEvent<HTMLInputElement>) {
    setDeleteFeatures(e.target.checked)
  }

  useEffect(() => {
    if (!selectedAssembly) {
      return
    }
    const updateFeaturesCount = async () => {
      const uri = new URL('features/count', baseURL)
      const searchParams = new URLSearchParams({
        assemblyId: selectedAssembly.name,
      })
      uri.search = searchParams.toString()

      setLoading(true)
      const response = await apolloFetch(uri.toString(), { method: 'GET' })

      if (response.ok) {
        const countObj = (await response.json()) as { count: number }
        setFeaturesCount(countObj.count)
      } else {
        throw new Error(await createFetchErrorMessage(response))
      }

      setLoading(false)
    }

    updateFeaturesCount().catch((error) => {
      console.error(error)
      setErrorMessage(error.message ?? error)
    })
  }, [baseURL, session, selectedAssembly])

  function handleChangeFile(e: React.ChangeEvent<HTMLInputElement>) {
    setSubmitted(false)
    if (!e.target.files) {
      return
    }
    setFile(e.target.files[0])
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitted) {
      console.debug(
        '[ImportFeatures] onSubmit called while already submitted — confirms double-submit race condition.',
      )
      return
    }
    console.debug('[ImportFeatures] onSubmit called.', {
      file: file?.name,
      assembly: selectedAssembly?.name,
      submitted,
    })
    setErrorMessage('')
    setLoading(true)
    setSubmitted(true)

    let fileId = ''

    if (!file) {
      setErrorMessage('must select a file')
      return
    }

    if (!selectedAssembly) {
      setErrorMessage('Must select assembly to download')
      return
    }

    const url = new URL('files', baseURL)
    url.searchParams.set('type', 'text/x-gff3')
    const uri = url.href
    const formData = new FormData()
    formData.append('file', file)
    formData.append('fileName', file.name)
    formData.append('type', 'text/x-gff3')

    handleClose()

    const { jobsManager } = session
    const controller = new AbortController()

    const job = {
      name: `Importing features for ${selectedAssembly.displayName}`,
      statusMessage: 'Uploading file, this may take awhile',
      progressPct: 0,
      cancelCallback: () => {
        controller.abort(
          new DOMException(
            `Canceling importing of features to ${selectedAssembly.displayName}`,
            'AbortError',
          ),
        )
        jobsManager.abortJob(job.name)
      },
    }

    jobsManager.runJob(job)

    const { signal } = controller
    const response = await apolloFetch(uri, {
      method: 'POST',
      body: formData,
      signal,
    })
    if (!response.ok) {
      const newErrorMessage = await createFetchErrorMessage(
        response,
        'Error when inserting new features (while uploading file)',
      )
      jobsManager.abortJob(job.name, newErrorMessage)
      setErrorMessage(newErrorMessage)
      return
    }
    const result = await response.json()
    fileId = result._id

    const change = new AddFeaturesFromFileChange({
      typeName: 'AddFeaturesFromFileChange',
      assembly: selectedAssembly.name,
      fileId,
      deleteExistingFeatures: deleteFeatures,
    })

    jobsManager.done(job)

    await changeManager.submit(change, { updateJobsManager: true })
  }

  return (
    <Dialog
      open
      title="Import Features from GFF3 file"
      handleClose={handleClose}
      maxWidth={false}
      data-testid="import-features-dialog"
    >
      {loading ? <LinearProgress /> : null}

      <form onSubmit={onSubmit}>
        <DialogContent style={{ display: 'flex', flexDirection: 'column' }}>
          <DialogContentText>Select assembly</DialogContentText>
          <Select
            labelId="label"
            value={selectedAssembly?.name ?? ''}
            onChange={handleChangeAssembly}
            disabled={submitted && !errorMessage}
          >
            {assemblies.map((option) => (
              <MenuItem key={option.name} value={option.name}>
                {option.displayName ?? option.name}
              </MenuItem>
            ))}
          </Select>
        </DialogContent>
        <DialogContent style={{ display: 'flex', flexDirection: 'column' }}>
          <DialogContentText>Upload GFF3 to load features</DialogContentText>
          <input
            type="file"
            onChange={handleChangeFile}
            disabled={submitted && !errorMessage}
          />
        </DialogContent>

        {featuresCount && featuresCount > 0 ? (
          <DialogContent>
            <DialogContentText>
              This assembly already has {featuresCount} features, would you like
              to delete the existing features before importing new ones?
            </DialogContentText>
            <FormControlLabel
              label="Yes, delete existing features"
              disabled={submitted && !errorMessage}
              control={
                <Checkbox
                  checked={deleteFeatures}
                  onChange={handleDeleteFeatures}
                  slotProps={{ input: { 'aria-label': 'controlled' } }}
                  color="warning"
                />
              }
            />
          </DialogContent>
        ) : null}

        <DialogActions>
          <Button
            disabled={
              !(selectedAssembly && file && featuresCount !== undefined) ||
              submitted
            }
            variant="contained"
            type="submit"
          >
            {submitted ? 'Submitting...' : 'Submit'}
          </Button>
          <Button variant="outlined" type="submit" onClick={handleClose}>
            Close
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
