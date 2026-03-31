import type React from 'react'
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
const encodedName = assemblyName ? encodeURIComponent(assemblyName) : undefined

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <Typography variant="body1">
      <strong>{label}:</strong> {children}
    </Typography>
  )
}

function AssemblyDetailPage() {
  const {
    data: assembly,
    error: assemblyError,
    isLoading,
  } = useSWR<Assembly, unknown>(
    encodedName ? `/assemblies/by-name/${encodedName}` : null,
    fetchJson,
  )
  const { data: currentUser } = useSWR<User | null>('/users/me', fetchJson)

  return (
    <Nav current="assemblies">
      <Container>
        {!assemblyName ? (
          <Alert severity="error">No assembly name in URL</Alert>
        ) : assemblyError ? (
          <Alert severity="error">
            {assemblyError instanceof Error
              ? assemblyError.message
              : 'Unknown error'}
          </Alert>
        ) : isLoading || !assembly ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <Breadcrumbs sx={{ mb: 2 }}>
              <Link underline="hover" color="inherit" href="/ui/assemblies/">
                Assemblies
              </Link>
              <Typography color="text.primary">{assembly.displayName}</Typography>
            </Breadcrumbs>

            <Box sx={{ mb: 3 }}>
              <Field label="Name">{assembly.name}</Field>
              {assembly.displayName !== assembly.name ? (
                <Field label="Display name">{assembly.displayName}</Field>
              ) : null}
              {assembly.description ? (
                <Field label="Description">{assembly.description}</Field>
              ) : null}
              {assembly.organism ? (
                <Field label="Organism">
                  <Link href={`/ui/organisms/${assembly.organism}`}>
                    {assembly.organismDisplayName ?? assembly.organism}
                  </Link>
                </Field>
              ) : null}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography variant="body1" component="span">
                  <strong>Visibility:</strong>
                </Typography>
                <Chip
                  label={assembly.visibility ?? 'private'}
                  size="small"
                  color={assembly.visibility === 'public' ? 'success' : 'default'}
                  variant="outlined"
                />
              </Box>
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
          </>
        )}
      </Container>
    </Nav>
  )
}

const root = document.querySelector('#root')
if (root) {
  createRoot(root).render(<AssemblyDetailPage />)
}
