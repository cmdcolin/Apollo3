import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Container from '@mui/material/Container'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { Nav } from './Nav.js'
import { fetchJson } from './fetchUtil.js'

interface Assembly {
  _id: string
  name: string
  displayName?: string
  description?: string
  organism?: string
  visibility?: 'public' | 'private'
}

interface RefSeq {
  _id: string
  name: string
  assembly: string
  length: number
  description?: string
}

interface TrackConfig {
  _id: string
  trackId: string
  config: Record<string, unknown>
}

interface Organism {
  _id: string
  genus?: string
  species?: string
  commonName?: string
}

function getAssemblyId() {
  const parts = globalThis.location.pathname.split('/').filter(Boolean)
  // /ui/assemblies/:id
  if (parts.length >= 3 && parts[0] === 'ui' && parts[1] === 'assemblies') {
    return parts[2]
  }
  return undefined
}

function AssemblyDetailPage() {
  const assemblyId = getAssemblyId()
  const [assembly, setAssembly] = useState<Assembly>()
  const [refSeqs, setRefSeqs] = useState<RefSeq[]>([])
  const [tracks, setTracks] = useState<TrackConfig[]>([])
  const [organism, setOrganism] = useState<Organism>()
  const [error, setError] = useState<string>()

  const load = useCallback(async () => {
    if (!assemblyId) {
      setError('No assembly ID in URL')
      return
    }
    try {
      setError(undefined)
      const [assemblyData, refSeqData, trackData] = await Promise.all([
        fetchJson<Assembly>(`/assemblies/${assemblyId}`),
        fetchJson<RefSeq[]>(`/refSeqs?assembly=${assemblyId}`),
        fetchJson<TrackConfig[]>(`/tracks?assembly=${assemblyId}`),
      ])
      setAssembly(assemblyData)
      setRefSeqs(refSeqData)
      setTracks(trackData)

      if (assemblyData.organism) {
        try {
          const org = await fetchJson<Organism>(
            `/organisms/${assemblyData.organism}`,
          )
          setOrganism(org)
        } catch {
          // organism fetch is non-critical
        }
      }
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_))
    }
  }, [assemblyId])

  useEffect(() => {
    void load()
  }, [load])

  const displayName = assembly?.displayName ?? assembly?.name ?? assemblyId

  return (
    <Nav current="assemblies">
      <Container>
        <Breadcrumbs sx={{ mb: 2 }}>
          <Link underline="hover" color="inherit" href="/ui/assemblies/">
            Assemblies
          </Link>
          <Typography color="text.primary">{displayName}</Typography>
        </Breadcrumbs>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {assembly ? (
          <>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                mb: 1,
              }}
            >
              <Typography variant="h4">{displayName}</Typography>
              <Chip
                label={assembly.visibility ?? 'private'}
                size="small"
                color={assembly.visibility === 'public' ? 'success' : 'default'}
                variant="outlined"
              />
            </Box>

            {assembly.description ? (
              <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                {assembly.description}
              </Typography>
            ) : null}

            <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
              {organism ? (
                <Chip
                  label={
                    `${organism.genus ?? ''} ${organism.species ?? ''}`.trim() ||
                    organism.commonName ||
                    'Unknown organism'
                  }
                  size="small"
                  variant="outlined"
                  component="a"
                  href={`/ui/organisms/${assembly.organism}`}
                  clickable
                />
              ) : null}
              <Button
                variant="contained"
                size="small"
                href={`/jbrowse/?config=${encodeURIComponent(`/jbrowse/config.json?assemblies=${assembly._id}`)}`}
              >
                Open in JBrowse
              </Button>
              <Button
                variant="outlined"
                size="small"
                href={`/ui/blast/?assembly=${encodeURIComponent(assembly._id)}`}
              >
                BLAST Search
              </Button>
            </Box>

            <Typography variant="h6" sx={{ mb: 1 }}>
              Reference Sequences ({refSeqs.length})
            </Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell align="right">Length</TableCell>
                    <TableCell>Description</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {refSeqs.map((r) => (
                    <TableRow key={r._id} hover>
                      <TableCell>{r.name}</TableCell>
                      <TableCell align="right">
                        {r.length.toLocaleString()}
                      </TableCell>
                      <TableCell>{r.description ?? ''}</TableCell>
                    </TableRow>
                  ))}
                  {refSeqs.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        align="center"
                        sx={{ color: 'text.secondary' }}
                      >
                        No reference sequences
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </TableContainer>

            <Typography variant="h6" sx={{ mb: 1 }}>
              Evidence Tracks ({tracks.length})
            </Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Track ID</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tracks.map((t) => (
                    <TableRow key={t._id} hover>
                      <TableCell>
                        {(t.config.name as string) ?? t.trackId}
                      </TableCell>
                      <TableCell>{(t.config.type as string) ?? ''}</TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                        >
                          {t.trackId}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                  {tracks.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        align="center"
                        sx={{ color: 'text.secondary' }}
                      >
                        No evidence tracks
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        ) : null}
      </Container>
    </Nav>
  )
}

const root = document.querySelector('#root')
if (root) {
  createRoot(root).render(<AssemblyDetailPage />)
}
