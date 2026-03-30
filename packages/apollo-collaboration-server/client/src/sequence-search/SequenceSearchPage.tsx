import Alert from '@mui/material/Alert'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import Container from '@mui/material/Container'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useState } from 'react'

import { Nav } from '../Nav.js'
import { fetchJson } from '../fetchUtil.js'

import { AdminDatabasePanel } from './admin/AdminDatabasePanel.js'
import { useAnalysisSearch } from './hooks/useAnalysisSearch.js'
import { useCurrentUser } from './hooks/useCurrentUser.js'
import { SearchResults } from './results/SearchResults.js'
import { LocalToolSearchTab } from './tabs/LocalToolSearchTab.js'
import {
  type AnalysisDb,
  type Assembly,
  TAB_TOOLS,
  TOOL_DESCRIPTIONS,
  TOOL_LABELS,
} from './types.js'

const TOOL_PAGE: Record<
  string,
  'seq-local-blast' | 'seq-blat' | 'seq-miniprot' | 'seq-ispcr'
> = {
  'local-blast': 'seq-local-blast',
  blat: 'seq-blat',
  miniprot: 'seq-miniprot',
  ispcr: 'seq-ispcr',
}

const TOOL_HREF: Record<string, string> = {
  'local-blast': '/ui/sequence-search/local-blast/',
  blat: '/ui/sequence-search/blat/',
  miniprot: '/ui/sequence-search/miniprot/',
  ispcr: '/ui/sequence-search/ispcr/',
}

export function SequenceSearchPortal() {
  return (
    <Nav>
      <Container maxWidth="lg">
        <Typography variant="h4" sx={{ mb: 1 }}>
          Sequence Search
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
          Choose a search tool:
        </Typography>
        <Grid container spacing={3}>
          {TAB_TOOLS.map((tool) => (
            <Grid key={tool} size={{ xs: 12, sm: 6, md: 3 }}>
              <Card variant="outlined" sx={{ height: '100%' }}>
                <CardActionArea
                  component="a"
                  href={TOOL_HREF[tool]}
                  sx={{ height: '100%', alignItems: 'flex-start' }}
                >
                  <CardContent>
                    <Typography variant="h6" sx={{ mb: 1 }}>
                      {TOOL_LABELS[tool] ?? tool}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {TOOL_DESCRIPTIONS[tool] ?? ''}
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Nav>
  )
}

function getInitialAssembly() {
  const params = new URLSearchParams(globalThis.location.search)
  return params.get('assembly') ?? ''
}

export function SequenceSearchPage({ tool }: { tool: string }) {
  const user = useCurrentUser()
  const [assemblies, setAssemblies] = useState<Assembly[]>([])
  const [analysisDbs, setAnalysisDbs] = useState<AnalysisDb[]>([])
  const [loadError, setLoadError] = useState<string>()
  const search = useAnalysisSearch()

  const loadAssemblies = useCallback(async () => {
    try {
      const data = await fetchJson<Assembly[]>('/assemblies')
      setAssemblies(data)
    } catch (error_) {
      const msg = error_ instanceof Error ? error_.message : String(error_)
      console.error('Failed to load assemblies', error_)
      setLoadError(msg)
    }
  }, [])

  const loadDatabases = useCallback(async () => {
    const assembly = getInitialAssembly()
    try {
      const url = assembly
        ? `/analysis/databases?assembly=${assembly}`
        : '/analysis/databases'
      const data = await fetchJson<AnalysisDb[]>(url)
      setAnalysisDbs(data)
    } catch (error_) {
      const msg = error_ instanceof Error ? error_.message : String(error_)
      console.error('Failed to load databases', error_)
      setLoadError(msg)
    }
  }, [])

  useEffect(() => {
    void loadAssemblies()
  }, [loadAssemblies])

  useEffect(() => {
    void loadDatabases()
  }, [loadDatabases])

  const canSubmit = user?.role === 'admin' || user?.role === 'user'
  const assemblyName =
    assemblies.find((a) => a._id === search.assemblyId)?.name ?? ''

  return (
    <Nav current={TOOL_PAGE[tool]}>
      <Container maxWidth="lg">
        <Typography variant="h4" sx={{ mb: 3 }}>
          {TOOL_LABELS[tool] ?? tool}
        </Typography>

        {loadError ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {loadError}
          </Alert>
        ) : null}

        {canSubmit ? null : (
          <Alert severity="info" sx={{ mb: 2 }}>
            Sequence search requires a logged-in user account. Guest and
            read-only users cannot submit searches.
          </Alert>
        )}

        <LocalToolSearchTab
          tool={tool}
          assemblies={assemblies}
          analysisDbs={analysisDbs}
          search={search}
          canSubmit={canSubmit}
        />

        <SearchResults search={search} assemblyName={assemblyName} />

        {user?.role === 'admin' ? (
          <AdminDatabasePanel
            assemblies={assemblies}
            analysisDbs={analysisDbs}
            onChanged={() => {
              void loadDatabases()
            }}
          />
        ) : null}
      </Container>
    </Nav>
  )
}
