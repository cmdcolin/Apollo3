import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { AdminNav } from './Nav.js'
import { fetchJson } from './fetchUtil.js'
import { AdminDatabasePanel } from './sequence-search/admin/AdminDatabasePanel.js'
import { type AnalysisDb, type Assembly } from './sequence-search/types.js'

function AnalysisDatabasesPage() {
  const [assemblies, setAssemblies] = useState<Assembly[]>([])
  const [analysisDbs, setAnalysisDbs] = useState<AnalysisDb[]>([])

  const loadAssemblies = useCallback(async () => {
    try {
      const data = await fetchJson<Assembly[]>('/assemblies')
      setAssemblies(data)
    } catch (error_) {
      console.error('Failed to load assemblies', error_)
    }
  }, [])

  const loadDatabases = useCallback(async () => {
    try {
      const data = await fetchJson<AnalysisDb[]>('/analysis/databases')
      setAnalysisDbs(data)
    } catch (error_) {
      console.error('Failed to load databases', error_)
    }
  }, [])

  useEffect(() => {
    void loadAssemblies()
  }, [loadAssemblies])

  useEffect(() => {
    void loadDatabases()
  }, [loadDatabases])

  return (
    <AdminNav current="analysis-dbs">
      <Container maxWidth="lg">
        <Typography variant="h4" sx={{ mb: 3 }}>
          Analysis Databases
        </Typography>
        <AdminDatabasePanel
          assemblies={assemblies}
          analysisDbs={analysisDbs}
          onChanged={() => {
            void loadDatabases()
          }}
        />
      </Container>
    </AdminNav>
  )
}

const root = document.querySelector('#root')
if (root) {
  createRoot(root).render(<AnalysisDatabasesPage />)
}
