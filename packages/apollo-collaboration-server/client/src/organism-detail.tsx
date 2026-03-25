import Alert from '@mui/material/Alert'
import Breadcrumbs from '@mui/material/Breadcrumbs'
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

interface Organism {
  _id: string
  taxid?: number
  genus?: string
  species?: string
  commonName?: string
  description?: string
}

interface Assembly {
  _id: string
  name: string
  displayName?: string
  description?: string
  organism?: string
  visibility?: 'public' | 'private'
}

function getOrganismId() {
  const parts = globalThis.location.pathname.split('/').filter(Boolean)
  // /ui/organisms/:id
  if (parts.length >= 3 && parts[0] === 'ui' && parts[1] === 'organisms') {
    return parts[2]
  }
  return
}

function OrganismDetailPage() {
  const organismId = getOrganismId()
  const [organism, setOrganism] = useState<Organism>()
  const [assemblies, setAssemblies] = useState<Assembly[]>([])
  const [error, setError] = useState<string>()

  const load = useCallback(async () => {
    if (!organismId) {
      setError('No organism ID in URL')
      return
    }
    try {
      setError(undefined)
      const [organismData, allAssemblies] = await Promise.all([
        fetchJson<Organism>(`/organisms/${organismId}`),
        fetchJson<Assembly[]>('/assemblies'),
      ])
      setOrganism(organismData)
      setAssemblies(allAssemblies.filter((a) => a.organism === organismId))
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_))
    }
  }, [organismId])

  useEffect(() => {
    void load()
  }, [load])

  const displayName = organism
    ? `${organism.genus ?? ''} ${organism.species ?? ''}`.trim() ||
      organism.commonName ||
      organismId
    : organismId

  return (
    <Nav current="organisms">
      <Container>
        <Breadcrumbs sx={{ mb: 2 }}>
          <Link underline="hover" color="inherit" href="/ui/organisms/">
            Organisms
          </Link>
          <Typography color="text.primary">{displayName}</Typography>
        </Breadcrumbs>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {organism ? (
          <>
            <Typography variant="h4" sx={{ mb: 1 }}>
              {organism.genus || organism.species ? (
                <em>
                  {organism.genus ?? ''} {organism.species ?? ''}
                </em>
              ) : (
                (organism.commonName ?? organismId)
              )}
            </Typography>

            {organism.commonName && (organism.genus || organism.species) ? (
              <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
                {organism.commonName}
              </Typography>
            ) : null}

            {organism.description ? (
              <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                {organism.description}
              </Typography>
            ) : null}

            {organism.taxid ? (
              <Chip
                label={`Taxid: ${organism.taxid}`}
                size="small"
                variant="outlined"
                sx={{ mb: 3 }}
              />
            ) : null}

            <Typography variant="h6" sx={{ mb: 1 }}>
              Assemblies ({assemblies.length})
            </Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Display Name</TableCell>
                    <TableCell>Visibility</TableCell>
                    <TableCell>Open</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {assemblies.map((a) => (
                    <TableRow key={a._id} hover>
                      <TableCell>
                        <Link href={`/ui/assemblies/${a._id}`}>{a.name}</Link>
                      </TableCell>
                      <TableCell>{a.displayName ?? ''}</TableCell>
                      <TableCell>
                        <Chip
                          label={a.visibility ?? 'private'}
                          size="small"
                          color={
                            a.visibility === 'public' ? 'success' : 'default'
                          }
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/jbrowse/?config=${encodeURIComponent(`/jbrowse/config.json?assemblies=${a._id}`)}`}
                        >
                          Open in JBrowse
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                  {assemblies.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        align="center"
                        sx={{ color: 'text.secondary' }}
                      >
                        No assemblies assigned to this organism
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
  createRoot(root).render(<OrganismDetailPage />)
}
