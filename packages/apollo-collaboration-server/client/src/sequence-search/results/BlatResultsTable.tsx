import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import {
  DataGrid,
  type GridColDef,
  type GridRenderCellParams,
} from '@mui/x-data-grid'

import {
  GenomeLink,
  type JBrowseFeature,
  buildJBrowseUrl,
} from '../helpers/index.js'
import type { PslHit } from '../types.js'

export function BlatResultsTable({
  hits,
  assemblyName,
}: {
  hits: PslHit[]
  assemblyName: string
}) {
  function handleViewAll() {
    const features: JBrowseFeature[] = hits.map((hit, i) => ({
      uniqueId: `blat-${i}`,
      refName: hit.tName,
      start: hit.tStart,
      end: hit.tEnd,
      name: hit.qName,
      score: hit.score,
      strand: hit.strand === '-' ? -1 : 1,
    }))
    const url = buildJBrowseUrl(features, 'BLAT Hits', assemblyName)
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  const columns: GridColDef<PslHit>[] = [
    {
      field: 'qName',
      headerName: 'Query',
      width: 160,
      renderCell: (p: GridRenderCellParams<PslHit, string>) => (
        <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
          {p.value}
        </span>
      ),
    },
    { field: 'strand', headerName: 'Strand', width: 70 },
    { field: 'score', headerName: 'Score', type: 'number', width: 90 },
    {
      field: 'identity',
      headerName: 'Identity',
      type: 'number',
      width: 90,
      valueFormatter: (value: number) => `${value.toFixed(1)}%`,
    },
    {
      field: 'queryRange',
      headerName: 'Query range',
      width: 120,
      sortable: false,
      valueGetter: (_value: unknown, row: PslHit) =>
        `${row.qStart}–${row.qEnd}`,
    },
    {
      field: 'location',
      headerName: 'Location',
      width: 220,
      sortable: false,
      renderCell: (p: GridRenderCellParams<PslHit>) => (
        <GenomeLink
          refName={p.row.tName}
          start={p.row.tStart}
          end={p.row.tEnd}
          assemblyName={assemblyName}
        />
      ),
    },
  ]

  const rows = hits.map((hit, i) => ({ id: i, ...hit }))

  return (
    <Paper variant="outlined" sx={{ mb: 3 }}>
      <Box
        sx={{
          p: 2,
          pb: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1,
        }}
      >
        <Typography variant="h6">
          BLAT — {hits.length} hit{hits.length === 1 ? '' : 's'}
        </Typography>
        {hits.length > 0 && assemblyName ? (
          <Button size="small" variant="outlined" onClick={handleViewAll}>
            View all in JBrowse ↗
          </Button>
        ) : null}
      </Box>
      {hits.length === 0 ? (
        <Box sx={{ p: 2 }}>
          <Typography variant="body2" color="text.secondary">
            No hits found.
          </Typography>
        </Box>
      ) : (
        <DataGrid
          rows={rows}
          columns={columns}
          density="compact"
          disableRowSelectionOnClick
          autoHeight
          pageSizeOptions={[25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          sx={{ border: 'none', borderTop: 1, borderColor: 'divider' }}
        />
      )}
    </Paper>
  )
}
