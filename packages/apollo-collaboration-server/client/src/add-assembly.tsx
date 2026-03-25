import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Select from '@mui/material/Select'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { AdminNav } from './Nav.js'
import { fetchJson } from './fetchUtil.js'

interface Organism {
  _id: string
  genus?: string
  species?: string
  commonName?: string
}

type SourceType = 'fasta' | 'twobit'

function organismLabel(o: Organism) {
  const sci = `${o.genus ?? ''} ${o.species ?? ''}`.trim()
  if (sci && o.commonName) {
    return `${sci} (${o.commonName})`
  }
  return sci || o.commonName || o._id
}

function AddAssemblyPage() {
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [sourceType, setSourceType] = useState<SourceType>('fasta')
  const [fastaPath, setFastaPath] = useState('')
  const [faiPath, setFaiPath] = useState('')
  const [gziPath, setGziPath] = useState('')
  const [twobitPath, setTwobitPath] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [organisms, setOrganisms] = useState<Organism[]>([])
  const [selectedOrganism, setSelectedOrganism] = useState<Organism | null>(
    null,
  )
  const [newGenus, setNewGenus] = useState('')
  const [newSpecies, setNewSpecies] = useState('')
  const [newCommonName, setNewCommonName] = useState('')
  const [createNewOrganism, setCreateNewOrganism] = useState(false)
  const [error, setError] = useState<string>()
  const [success, setSuccess] = useState<string>()
  const [submitting, setSubmitting] = useState(false)

  const loadOrganisms = useCallback(async () => {
    try {
      setOrganisms(await fetchJson<Organism[]>('/organisms'))
    } catch {
      // non-critical
    }
  }, [])

  useEffect(() => {
    void loadOrganisms()
  }, [loadOrganisms])

  async function handleSubmit() {
    if (!name.trim()) {
      setError('Assembly name is required')
      return
    }

    let sequenceSource
    if (sourceType === 'fasta') {
      if (!fastaPath.trim()) {
        setError('FASTA file path is required')
        return
      }
      sequenceSource = {
        type: 'fasta' as const,
        fa: fastaPath.trim(),
        fai: faiPath.trim() || `${fastaPath.trim()}.fai`,
        ...(gziPath.trim() ? { gzi: gziPath.trim() } : {}),
      }
    } else {
      if (!twobitPath.trim()) {
        setError('2bit file path is required')
        return
      }
      sequenceSource = {
        type: 'twobit' as const,
        twobit: twobitPath.trim(),
      }
    }

    setError(undefined)
    setSuccess(undefined)
    setSubmitting(true)

    try {
      let organismId = selectedOrganism?._id
      if (createNewOrganism && (newGenus.trim() || newCommonName.trim())) {
        const orgRes = await fetch('/organisms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(newGenus.trim() ? { genus: newGenus.trim() } : {}),
            ...(newSpecies.trim() ? { species: newSpecies.trim() } : {}),
            ...(newCommonName.trim()
              ? { commonName: newCommonName.trim() }
              : {}),
          }),
        })
        if (!orgRes.ok) {
          const text = await orgRes.text()
          throw new Error(`Organism creation failed: ${text}`)
        }
        const org = (await orgRes.json()) as { _id: string }
        organismId = org._id
      }

      const res = await fetch('/assemblies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
          sequenceSource,
          ...(organismId ? { organism: organismId } : {}),
          ...(isPublic ? { visibility: 'public' } : {}),
        }),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`${res.status}: ${text}`)
      }

      const assembly = (await res.json()) as { _id: string; name: string }
      setSuccess(`Assembly "${assembly.name}" created.`)
      setName('')
      setDisplayName('')
      setFastaPath('')
      setFaiPath('')
      setGziPath('')
      setTwobitPath('')
      setSelectedOrganism(null)
      setCreateNewOrganism(false)
      setNewGenus('')
      setNewSpecies('')
      setNewCommonName('')
      void loadOrganisms()
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AdminNav current="add-assembly">
      <Container maxWidth="sm">
        <Typography variant="h4" gutterBottom>
          Add Assembly
        </Typography>

        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}
        {success ? (
          <Alert severity="success" sx={{ mb: 2 }}>
            {success}
          </Alert>
        ) : null}

        <Paper variant="outlined" sx={{ p: 3 }}>
          <TextField
            fullWidth
            required
            label="Assembly name"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
            }}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="Display name"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value)
            }}
            sx={{ mb: 2 }}
          />

          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Sequence source type</InputLabel>
            <Select
              value={sourceType}
              label="Sequence source type"
              onChange={(e) => {
                setSourceType(e.target.value as SourceType)
              }}
            >
              <MenuItem value="fasta">FASTA</MenuItem>
              <MenuItem value="twobit">2bit</MenuItem>
            </Select>
          </FormControl>

          {sourceType === 'fasta' ? (
            <>
              <TextField
                fullWidth
                required
                label="FASTA file path (server-accessible)"
                value={fastaPath}
                onChange={(e) => {
                  setFastaPath(e.target.value)
                }}
                placeholder="/path/to/genome.fa"
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                label="FAI index path (defaults to FASTA + .fai)"
                value={faiPath}
                onChange={(e) => {
                  setFaiPath(e.target.value)
                }}
                placeholder="/path/to/genome.fa.fai"
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                label="GZI index path (for bgzip-compressed FASTA)"
                value={gziPath}
                onChange={(e) => {
                  setGziPath(e.target.value)
                }}
                placeholder="/path/to/genome.fa.gz.gzi"
                sx={{ mb: 2 }}
              />
            </>
          ) : (
            <TextField
              fullWidth
              required
              label="2bit file path (server-accessible)"
              value={twobitPath}
              onChange={(e) => {
                setTwobitPath(e.target.value)
              }}
              placeholder="/path/to/genome.2bit"
              sx={{ mb: 2 }}
            />
          )}

          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Organism
          </Typography>

          {createNewOrganism ? (
            <>
              <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                <TextField
                  size="small"
                  label="Genus"
                  value={newGenus}
                  onChange={(e) => {
                    setNewGenus(e.target.value)
                  }}
                />
                <TextField
                  size="small"
                  label="Species"
                  value={newSpecies}
                  onChange={(e) => {
                    setNewSpecies(e.target.value)
                  }}
                />
                <TextField
                  size="small"
                  label="Common name"
                  value={newCommonName}
                  onChange={(e) => {
                    setNewCommonName(e.target.value)
                  }}
                />
              </Box>
              <Button
                size="small"
                onClick={() => {
                  setCreateNewOrganism(false)
                }}
                sx={{ mb: 2 }}
              >
                Use existing organism instead
              </Button>
            </>
          ) : (
            <>
              <Autocomplete
                size="small"
                options={organisms}
                getOptionLabel={organismLabel}
                value={selectedOrganism}
                onChange={(_e, val) => {
                  setSelectedOrganism(val)
                }}
                renderInput={(params) => (
                  <TextField {...params} label="Select organism" />
                )}
                sx={{ mb: 1 }}
              />
              <Button
                size="small"
                onClick={() => {
                  setCreateNewOrganism(true)
                  setSelectedOrganism(null)
                }}
                sx={{ mb: 2 }}
              >
                Create new organism
              </Button>
            </>
          )}

          <FormControlLabel
            control={
              <Switch
                checked={isPublic}
                onChange={(e) => {
                  setIsPublic(e.target.checked)
                }}
              />
            }
            label="Public visibility"
            sx={{ mb: 2 }}
          />

          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="contained"
              disabled={submitting}
              onClick={() => {
                void handleSubmit()
              }}
            >
              {submitting ? 'Creating...' : 'Create Assembly'}
            </Button>
            <Button variant="outlined" href="/ui/assemblies/">
              Cancel
            </Button>
          </Box>
        </Paper>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          To load features from a GFF3 file, use the CLI: apollo assembly
          add-from-gff
        </Typography>
      </Container>
    </AdminNav>
  )
}

const root = document.querySelector('#root')
if (root) {
  createRoot(root).render(<AddAssemblyPage />)
}
