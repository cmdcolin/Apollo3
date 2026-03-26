import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import LinearProgress from '@mui/material/LinearProgress'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'

import type { SearchState } from '../hooks/useAnalysisSearch.js'
import {
  type BlastSearchResult,
  type GeneModel,
  type IsPcrProduct,
  type PslHit,
  TOOL_LABELS,
} from '../types.js'

import { BlastResultsTable } from './BlastResultsTable.js'
import { BlatResultsTable } from './BlatResultsTable.js'
import { IsPcrResultsTable } from './IsPcrResultsTable.js'
import { MiniprotResultsTable } from './MiniprotResultsTable.js'

export function SearchResults({
  search,
  assemblyName,
}: {
  search: SearchState
  assemblyName: string
}) {
  const tool = search.tool ?? ''
  const { results } = search

  return (
    <>
      {search.submitting ? (
        <Paper variant="outlined" sx={{ p: 3, mb: 3, textAlign: 'center' }}>
          <CircularProgress size={24} sx={{ mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            {TOOL_LABELS[tool] ?? tool} search in progress… job {search.jobId}{' '}
            {search.status ? `(${search.status})` : ''}
          </Typography>
          <LinearProgress sx={{ mt: 2 }} />
          <Button
            variant="outlined"
            color="error"
            size="small"
            sx={{ mt: 2 }}
            onClick={() => {
              search.cancel()
            }}
          >
            Cancel
          </Button>
        </Paper>
      ) : null}

      {search.error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {search.error}
        </Alert>
      ) : null}

      {results && tool === 'blat' ? (
        <BlatResultsTable
          hits={(results as { hits: PslHit[] }).hits}
          assemblyName={assemblyName}
        />
      ) : null}

      {results && tool === 'miniprot' ? (
        <MiniprotResultsTable
          geneModels={(results as { geneModels: GeneModel[] }).geneModels}
          gff3={(results as { gff3: string }).gff3}
          assemblyName={assemblyName}
        />
      ) : null}

      {results && tool === 'local-blast' ? (
        <BlastResultsTable
          results={results as BlastSearchResult}
          program={
            typeof search.params?.program === 'string'
              ? search.params.program
              : ''
          }
          assemblyName={assemblyName}
        />
      ) : null}

      {results && tool === 'ispcr' ? (
        <IsPcrResultsTable
          products={(results as { products: IsPcrProduct[] }).products}
          assemblyName={assemblyName}
        />
      ) : null}

      {results && !search.error && !search.submitting ? (
        <Box sx={{ mb: 2 }} />
      ) : null}
    </>
  )
}
