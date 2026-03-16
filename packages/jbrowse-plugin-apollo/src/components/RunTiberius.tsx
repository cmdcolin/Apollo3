import type { Region } from '@jbrowse/core/util/types'
import {
  Box,
  Button,
  CircularProgress,
  DialogActions,
  DialogContent,
  DialogContentText,
  Typography,
} from '@mui/material'
import React, { useCallback, useEffect, useState } from 'react'

import { CollaborationServerDriver } from '../BackendDrivers'
import type { ApolloSessionModel } from '../session'

import { Dialog } from './Dialog'

interface RunTiberiusProps {
  session: ApolloSessionModel
  handleClose(): void
  region: Region
}

type JobStatus = 'idle' | 'starting' | 'running' | 'completed' | 'failed'

export function RunTiberius({
  handleClose,
  region,
  session,
}: RunTiberiusProps) {
  const [status, setStatus] = useState<JobStatus>('idle')
  const [jobId, setJobId] = useState<string>()
  const [message, setMessage] = useState('')
  const [featureCount, setFeatureCount] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [maxRegionSize, setMaxRegionSize] = useState<number>()

  const regionSize = region.end - region.start
  const regionTooLarge =
    maxRegionSize !== undefined && regionSize > maxRegionSize

  useEffect(() => {
    const backendDriver = session.apolloDataStore.getBackendDriver(
      region.assemblyName,
    )
    if (backendDriver instanceof CollaborationServerDriver) {
      void backendDriver.checkTiberiusAvailable().then((result) => {
        if (!result.available) {
          setErrorMessage(
            'Tiberius is not available on this server. Configure apollo-tools.json or install tiberius.py on the server PATH.',
          )
        }
        if (result.maxRegionSize) {
          setMaxRegionSize(result.maxRegionSize)
        }
      })
    }
  }, [session, region.assemblyName])

  const pollStatus = useCallback(
    (id: string) => {
      const backendDriver = session.apolloDataStore.getBackendDriver(
        region.assemblyName,
      )
      if (!(backendDriver instanceof CollaborationServerDriver)) {
        return
      }
      const interval = setInterval(() => {
        void backendDriver.getTiberiusStatus(id).then((result) => {
          if (result.status === 'completed') {
            clearInterval(interval)
            setStatus('completed')
            setMessage(result.message ?? 'Completed')
            setFeatureCount(result.featureIds?.length ?? 0)
          }
          if (result.status === 'failed') {
            clearInterval(interval)
            setStatus('failed')
            setErrorMessage(result.message ?? 'Tiberius failed')
          }
        })
      }, 3000)
      return () => {
        clearInterval(interval)
      }
    },
    [session, region.assemblyName],
  )

  async function handleRun() {
    setStatus('starting')
    setErrorMessage('')

    const backendDriver = session.apolloDataStore.getBackendDriver(
      region.assemblyName,
    )
    if (!(backendDriver instanceof CollaborationServerDriver)) {
      setErrorMessage('Tiberius requires a collaboration server backend')
      setStatus('failed')
      return
    }

    const refSeqId = await backendDriver.getRefSeqId(
      region.assemblyName,
      region.refName,
    )
    if (!refSeqId) {
      setErrorMessage(`Could not find refSeq for "${region.refName}"`)
      setStatus('failed')
      return
    }

    const result = await backendDriver.runTiberius({
      assembly: region.assemblyName,
      refSeqId,
      start: region.start,
      end: region.end,
    })
    setJobId(result.jobId)
    setStatus('running')
    pollStatus(result.jobId)
  }

  const isRunning = status === 'starting' || status === 'running'
  const formatBp = (n: number) => n.toLocaleString()

  return (
    <Dialog
      open
      title="Run Tiberius Gene Prediction"
      handleClose={handleClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogContent>
        <Typography variant="body1" gutterBottom>
          Region: {region.refName}:{formatBp(region.start)}-
          {formatBp(region.end)} ({formatBp(regionSize)} bp)
        </Typography>

        {regionTooLarge ? (
          <DialogContentText color="error">
            Region exceeds maximum size of {formatBp(maxRegionSize)} bp.
          </DialogContentText>
        ) : null}

        {isRunning ? (
          <Box display="flex" alignItems="center" gap={2} mt={2}>
            <CircularProgress size={24} />
            <Typography>
              {status === 'starting'
                ? 'Starting Tiberius...'
                : 'Running gene prediction...'}
            </Typography>
          </Box>
        ) : null}

        {status === 'completed' ? (
          <DialogContentText color="success.main" sx={{ mt: 2 }}>
            {featureCount > 0
              ? `${featureCount} gene(s) predicted and imported.`
              : 'No genes predicted in this region.'}
          </DialogContentText>
        ) : null}

        {errorMessage ? (
          <DialogContentText color="error" sx={{ mt: 2 }}>
            {errorMessage}
          </DialogContentText>
        ) : null}
      </DialogContent>

      <DialogActions>
        {status === 'idle' ? (
          <>
            {}
            <Button
              variant="contained"
              onClick={handleRun}
              disabled={regionTooLarge || Boolean(errorMessage)}
            >
              Run
            </Button>
            <Button variant="outlined" onClick={handleClose}>
              Cancel
            </Button>
          </>
        ) : null}
        {status === 'completed' || status === 'failed' ? (
          <Button variant="outlined" onClick={handleClose}>
            Close
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  )
}
