import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useState } from 'react'

import { Nav } from '../Nav.js'
import { fetchJson } from '../fetchUtil.js'
import { AdminDatabasePanel } from './admin/AdminDatabasePanel.js'
import { useAnalysisSearch } from './hooks/useAnalysisSearch.js'
import { useCurrentUser } from './hooks/useCurrentUser.js'
import { SearchResults } from './results/SearchResults.js'
import { LocalToolSearchTab } from './tabs/LocalToolSearchTab.js'
import { TAB_TOOLS, TOOL_LABELS } from './types.js'
import type { AnalysisDb, Assembly } from './types.js'

function getInitialAssembly() {
  const params = new URLSearchParams(globalThis.location.search)
  return params.get('assembly') ?? ''
}

export function SequenceSearchPage() {
  const user = useCurrentUser()
  const [assemblies, setAssemblies] = useState<Assembly[]>([])
  const [analysisDbs, setAnalysisDbs] = useState<AnalysisDb[]>([])
  const [tab, setTab] = useState(0)
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
  const selectedTool = TAB_TOOLS[tab] ?? TAB_TOOLS[0]

  const assemblyName =
    assemblies.find((a) => a._id === search.assemblyId)?.name ?? ''

  return (
    <Nav current="sequence-search">
      <Container maxWidth="lg">
        <Typography variant="h4" sx={{ mb: 3 }}>
          Sequence Search
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

        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs
            value={tab}
            onChange={(_e, v) => {
              setTab(v as number)
            }}
          >
            {TAB_TOOLS.map((t) => (
              <Tab key={t} label={TOOL_LABELS[t] ?? t} />
            ))}
          </Tabs>
        </Box>

        <LocalToolSearchTab
          tool={selectedTool}
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
