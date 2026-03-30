import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Container from '@mui/material/Container'
import Link from '@mui/material/Link'
import Typography from '@mui/material/Typography'
import { createRoot } from 'react-dom/client'
import useSWR from 'swr'

import { Nav } from './Nav.js'
import { fetchJson } from './fetchUtil.js'

interface Assembly {
  _id: string
  name: string
  displayName: string
  description?: string
  organism?: string
  organismDisplayName?: string
  organismScientificName?: string
  visibility?: 'public' | 'private'
}

interface User {
  role: string
}

function getAssemblyName() {
  const parts = globalThis.location.pathname.split('/').filter(Boolean)
  if (parts.length >= 3 && parts[0] === 'ui' && parts[1] === 'assemblies') {
    return decodeURIComponent(parts[2])
  }
  return
}

const assemblyName = getAssemblyName()

function AssemblyDetailPage() {
  const encodedName = assemblyName
    ? encodeURIComponent(assemblyName)
    : undefined
  const {
    data: assembly,
    error: assemblyError,
    isLoading,
  } = useSWR<Assembly, unknown>(
    encodedName ? `/assemblies/by-name/${encodedName}` : null,
    fetchJson,
  )
  const { data: currentUser } = useSWR<User | null>('/users/me', fetchJson)

  if (!assemblyName) {
    return (
      <Nav current="assemblies">
        <Container>
          <Alert severity="error">No assembly name in URL</Alert>
        </Container>
      </Nav>
    )
  }

  if (assemblyError) {
    return (
      <Nav current="assemblies">
        <Container>
          <Alert severity="error">
            {assemblyError instanceof Error
              ? assemblyError.message
              : 'Unknown error'}
          </Alert>
        </Container>
      </Nav>
    )
  }

  if (isLoading || !assembly) {
    return (
      <Nav current="assemblies">
        <Container>
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
            <CircularProgress />
          </Box>
        </Container>
      </Nav>
    )
  }

  return (
    <Nav current="assemblies">
      <Container>
        <Breadcrumbs sx={{ mb: 2 }}>
          <Link underline="hover" color="inherit" href="/ui/assemblies/">
            Assemblies
          </Link>
          <Typography color="text.primary">{assembly.displayName}</Typography>
        </Breadcrumbs>

        <Box sx={{ mb: 3 }}>
          <Typography variant="body1">
            <strong>Name:</strong> {assembly.name}
          </Typography>
          {assembly.displayName !== assembly.name ? (
            <Typography variant="body1">
              <strong>Display name:</strong> {assembly.displayName}
            </Typography>
          ) : null}
          {assembly.description ? (
            <Typography variant="body1">
              <strong>Description:</strong> {assembly.description}
            </Typography>
          ) : null}
          {assembly.organism ? (
            <Typography variant="body1">
              <strong>Organism:</strong>{' '}
              <Link href={`/ui/organisms/${assembly.organism}`}>
                {assembly.organismDisplayName ?? assembly.organism}
              </Link>
            </Typography>
          ) : null}
          <Typography variant="body1">
            <strong>Visibility:</strong>{' '}
            <Chip
              label={assembly.visibility ?? 'private'}
              size="small"
              color={assembly.visibility === 'public' ? 'success' : 'default'}
              variant="outlined"
            />
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            size="small"
            href={`/jbrowse/?assemblies=${encodeURIComponent(assembly.name)}`}
          >
            Open in JBrowse
          </Button>
          {currentUser ? (
            <>
              <Button
                variant="outlined"
                size="small"
                href={`/ui/sequence-search/?assembly=${encodeURIComponent(assembly.name)}`}
              >
                Sequence Search
              </Button>
              <Button
                variant="outlined"
                size="small"
                href={`/ui/assembly-checks/${assembly.name}`}
              >
                Checks
              </Button>
              <Button
                variant="outlined"
                size="small"
                href={`/ui/assembly-tracks/${assembly.name}`}
              >
                Tracks
              </Button>
            </>
          ) : null}
          {currentUser?.role === 'admin' ? (
            <Button
              variant="outlined"
              size="small"
              href={`/ui/edit-assembly/${assembly.name}`}
            >
              Edit assembly
            </Button>
          ) : null}
        </Box>

      </Container>
    </Nav>
  )
}

const root = document.querySelector('#root')
if (root) {
  createRoot(root).render(<AssemblyDetailPage />)
}
