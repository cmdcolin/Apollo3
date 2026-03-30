/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/unbound-method */
import type { Region, SessionWithAddTracks } from '@jbrowse/core/util'
import {
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  DialogActions,
  DialogContent,
  DialogContentText,
  TextField,
  Typography,
} from '@mui/material'
import React, { useCallback, useEffect, useState } from 'react'

import { CollaborationServerDriver } from '../BackendDrivers'
import type { ApolloSessionModel } from '../session'
import { getBaseURL } from '../util'

import { Dialog } from './Dialog'

function formatBp(n: number) {
  return n.toLocaleString()
}

interface RunTiberiusProps {
  session: ApolloSessionModel
  view: { showTrack(trackId: string): void }
  handleClose(): void
  region: Region
}

type JobStatus = 'idle' | 'starting' | 'running' | 'completed' | 'failed'

export function RunTiberius({
  handleClose,
  region,
  session,
  view,
}: RunTiberiusProps) {
  const [status, setStatus] = useState<JobStatus>('idle')
  const [jobId, setJobId] = useState<string>()
  const [errorMessage, setErrorMessage] = useState('')
  const [maxRegionSize, setMaxRegionSize] = useState<number>()
  const [modelCfg, setModelCfg] = useState('')
  const [availableModels, setAvailableModels] = useState<string[]>([])

  const regionSize = region.end - region.start
  const regionTooLarge =
    maxRegionSize !== undefined && regionSize > maxRegionSize

  useEffect(() => {
    const backendDriver = session.apolloDataStore.getBackendDriver(
      region.assemblyName,
    )
    if (backendDriver instanceof CollaborationServerDriver) {
      void backendDriver
        .getAnalysisTools()
        .then((tools) => {
          const tiberius = tools.find((t) => t.tool === 'tiberius')
          if (!tiberius?.installed) {
            setErrorMessage(
              'Tiberius is not available on this server. Set TIBERIUS_PATH or install tiberius.py on the server PATH.',
            )
            return
          }
          const cfg = tiberius.config
          if (cfg) {
            if (typeof cfg.maxRegionSize === 'number') {
              setMaxRegionSize(cfg.maxRegionSize)
            }
            if (typeof cfg.modelCfg === 'string' && cfg.modelCfg) {
              setModelCfg(cfg.modelCfg)
            }
            if (
              Array.isArray(cfg.availableModels) &&
              cfg.availableModels.length > 0
            ) {
              setAvailableModels(cfg.availableModels as string[])
            }
          }
        })
        .catch((error: unknown) => {
          setErrorMessage(
            error instanceof Error ? error.message : String(error),
          )
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
        void backendDriver
          .getAnalysisJob(id)
          .then((result) => {
            if (result.status === 'ready') {
              clearInterval(interval)
              setStatus('completed')
            }
            if (result.status === 'failed') {
              clearInterval(interval)
              setStatus('failed')
              setErrorMessage(result.error ?? 'Tiberius failed')
            }
          })
          .catch((error: unknown) => {
            clearInterval(interval)
            setStatus('failed')
            setErrorMessage(
              `Lost connection to server: ${error instanceof Error ? error.message : String(error)}`,
            )
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

    try {
      const refSeqId = await backendDriver.getRefSeqId(
        region.assemblyName,
        region.refName,
      )
      if (!refSeqId) {
        setErrorMessage(`Could not find refSeq for "${region.refName}"`)
        setStatus('failed')
        return
      }

      const result = await backendDriver.submitAnalysisJob({
        tool: 'tiberius',
        assemblyName: region.assemblyName,
        params: {
          refSeqId,
          refSeqName: region.refName,
          start: region.start,
          end: region.end,
          modelCfg: modelCfg || undefined,
        },
      })
      setJobId(result._id)
      setStatus('running')
      pollStatus(result._id)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
      setStatus('failed')
    }
  }

  function handleShowTrack() {
    if (!jobId) {
      return
    }
    const trackId = `tiberius_${jobId}`
    const baseURL = getBaseURL(session)
    const trackConfig = {
      type: 'FeatureTrack',
      trackId,
      name: `Tiberius: ${region.refName}:${formatBp(region.start)}-${formatBp(region.end)}`,
      category: ['Gene Predictions'],
      assemblyNames: [region.assemblyName],
      adapter: {
        type: 'GtfAdapter',
        gtfLocation: {
          uri: `${baseURL}/analysis/jobs/${jobId}/files/predictions.gtf`,
          locationType: 'UriLocation',
        },
      },
    }
    ;(session as unknown as SessionWithAddTracks).addTrackConf(trackConfig)
    view.showTrack(trackId)
    handleClose()
  }

  const isRunning = status === 'starting' || status === 'running'

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

        {status === 'idle' && !errorMessage ? (
          <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Autocomplete
              freeSolo
              options={availableModels}
              value={modelCfg}
              onInputChange={(_event, newValue) => {
                setModelCfg(newValue)
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Species model"
                  size="small"
                  helperText="Select a species model or type a custom model config path"
                />
              )}
            />
          </Box>
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
            Gene prediction complete. A new track has been created with the
            results.
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
            <Button
              variant="contained"
              onClick={handleRun}
              disabled={regionTooLarge || Boolean(errorMessage) || !modelCfg}
            >
              Run
            </Button>
            <Button variant="outlined" onClick={handleClose}>
              Cancel
            </Button>
          </>
        ) : null}
        {status === 'completed' ? (
          <>
            <Button variant="contained" onClick={handleShowTrack}>
              Show Track
            </Button>
            <Button variant="outlined" onClick={handleClose}>
              Close
            </Button>
          </>
        ) : null}
        {status === 'failed' ? (
          <Button variant="outlined" onClick={handleClose}>
            Close
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  )
}
