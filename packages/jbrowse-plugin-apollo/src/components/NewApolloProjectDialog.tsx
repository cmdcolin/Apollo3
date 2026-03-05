/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-misused-promises */
import { Dialog, FileSelector } from '@jbrowse/core/ui'
import {
  Button,
  DialogActions,
  DialogContent,
  TextField,
  Typography,
} from '@mui/material'
import React, { useState } from 'react'

import type PluginManager from '@jbrowse/core/PluginManager'
import type { FileLocation } from '@jbrowse/core/util/types'

const blank = { uri: '' } as FileLocation

function isBlank(location: FileLocation) {
  return 'uri' in location && location.uri === ''
}

function getLocalPath(location: FileLocation) {
  if ('localPath' in location) {
    return location.localPath
  }
  if ('uri' in location) {
    return location.uri
  }
  return ''
}

function deriveDbPath(fastaLocation: FileLocation) {
  const fastaPath = getLocalPath(fastaLocation)
  if (fastaPath) {
    return fastaPath.replace(/\.(fa|fasta|fna)(\.gz)?$/i, '') + '.apollo.sqlite'
  }
  return ''
}

function deriveAssemblyName(fastaLocation: FileLocation) {
  const fastaPath = getLocalPath(fastaLocation)
  if (fastaPath) {
    const basename = fastaPath.split(/[/\\]/).pop() ?? ''
    return basename.replace(/\.(fa|fasta|fna)(\.gz)?(\.fai)?$/i, '')
  }
  return ''
}

export function NewApolloProjectDialog({
  loadPluginManager,
  onClose,
  setPluginManager,
}: {
  loadPluginManager: (path: string) => Promise<PluginManager>
  onClose: () => void
  setPluginManager: (pm: PluginManager) => void
}) {
  const [assemblyName, setAssemblyName] = useState('')
  const [fastaLocation, setFastaLocation] = useState(blank)
  const [faiLocation, setFaiLocation] = useState(blank)
  const [gff3Location, setGff3Location] = useState(blank)
  const [sqliteDbPath, setSqliteDbPath] = useState('')
  const [error, setError] = useState<unknown>()
  const [loading, setLoading] = useState(false)

  function handleFastaChange(loc: FileLocation) {
    setFastaLocation(loc)
    if (!assemblyName) {
      setAssemblyName(deriveAssemblyName(loc))
    }
    if (!sqliteDbPath) {
      setSqliteDbPath(deriveDbPath(loc))
    }
    if (isBlank(faiLocation)) {
      const fastaPath = getLocalPath(loc)
      if (fastaPath) {
        setFaiLocation({
          locationType: 'LocalPathLocation',
          localPath: fastaPath + '.fai',
        } as FileLocation)
      }
    }
  }

  async function handleSubmit() {
    if (!assemblyName) {
      setError(new Error('Assembly name is required'))
      return
    }
    if (isBlank(fastaLocation)) {
      setError(new Error('FASTA file is required'))
      return
    }
    if (isBlank(faiLocation)) {
      setError(new Error('FASTA index (.fai) file is required'))
      return
    }

    setLoading(true)
    setError(undefined)

    try {
      const { ipcRenderer } = window.require('electron')

      const metadata: Record<string, unknown> = {
        apollo: true,
        sqliteDb: sqliteDbPath || deriveDbPath(fastaLocation),
      }
      if (!isBlank(gff3Location)) {
        metadata.gff3File = getLocalPath(gff3Location)
      }

      const configSnapshot = {
        assemblies: [
          {
            name: assemblyName,
            sequence: {
              type: 'ReferenceSequenceTrack',
              trackId: `${assemblyName}-ReferenceSequenceTrack`,
              adapter: {
                type: 'IndexedFastaAdapter',
                fastaLocation,
                faiLocation,
              },
              metadata,
            },
          },
        ],
        defaultSession: {
          name: `Apollo - ${assemblyName}`,
        },
      }

      const path: string = await ipcRenderer.invoke(
        'createInitialAutosaveFile',
        configSnapshot,
      )

      setPluginManager(await loadPluginManager(path))
      onClose()
    } catch (e) {
      console.error(e)
      setError(e)
      setLoading(false)
    }
  }

  return (
    <Dialog
      open
      onClose={() => {
        if (!loading) {
          onClose()
        }
      }}
      title="New Apollo annotation project"
    >
      <DialogContent
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <Typography>
          Select a FASTA genome file and optionally a GFF3 file to create a new
          Apollo annotation project backed by a local SQLite database.
        </Typography>

        <TextField
          label="Assembly name"
          helperText="Name for the genome assembly (e.g. hg38)"
          variant="outlined"
          value={assemblyName}
          onChange={(e) => {
            setAssemblyName(e.target.value)
          }}
        />

        <FileSelector
          inline
          name="FASTA file"
          location={fastaLocation}
          setLocation={handleFastaChange}
        />

        <FileSelector
          inline
          name="FASTA index (.fai) file"
          location={faiLocation}
          setLocation={setFaiLocation}
        />

        <FileSelector
          inline
          name="GFF3 file (optional, for initial annotations)"
          location={gff3Location}
          setLocation={setGff3Location}
        />

        <TextField
          label="SQLite database path"
          helperText="Path for the Apollo SQLite database (auto-derived from FASTA path)"
          variant="outlined"
          fullWidth
          value={sqliteDbPath}
          onChange={(e) => {
            setSqliteDbPath(e.target.value)
          }}
        />

        {error ? (
          <Typography color="error">
            {error instanceof Error ? error.message : String(error)}
          </Typography>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button
          onClick={onClose}
          color="secondary"
          variant="contained"
          disabled={loading}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          color="primary"
          variant="contained"
          disabled={loading}
        >
          {loading ? 'Creating...' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
