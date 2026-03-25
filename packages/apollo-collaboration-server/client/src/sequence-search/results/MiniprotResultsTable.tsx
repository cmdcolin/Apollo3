import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import {
  DataGrid,
  type GridColDef,
  type GridRenderCellParams,
} from '@mui/x-data-grid'
import { useState } from 'react'

import {
  GenomeLink,
  type JBrowseFeature,
  buildJBrowseUrl,
  copyToClipboard,
} from '../helpers/index.js'
import type { GeneModel } from '../types.js'

export function MiniprotResultsTable({
  geneModels,
  gff3,
  assemblyName,
}: {
  geneModels: GeneModel[]
  gff3: string
  assemblyName: string
}) {
  const [gff3Copied, setGff3Copied] = useState(false)

  function handleCopyGff3() {
    copyToClipboard(gff3)
    setGff3Copied(true)
    setTimeout(() => {
      setGff3Copied(false)
    }, 2000)
  }

  function handleViewAll() {
    const features: JBrowseFeature[] = geneModels.map((gm, i) => ({
      uniqueId: `miniprot-${i}`,
      refName: gm.seqName,
      start: gm.start,
      end: gm.end,
      name: gm.target || `model-${i + 1}`,
      strand: gm.strand === '-' ? -1 : 1,
    }))
    const url = buildJBrowseUrl(features, 'miniprot Gene Models', assemblyName)
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  const columns: GridColDef<GeneModel & { id: number }>[] = [
    { field: 'strand', headerName: 'Strand', width: 70 },
    { field: 'exonCount', headerName: 'Exons', type: 'number', width: 70 },
    { field: 'identity', headerName: 'Identity', width: 90 },
    { field: 'target', headerName: 'Target protein', flex: 1, minWidth: 180 },
    {
      field: 'location',
      headerName: 'Location',
      width: 220,
      sortable: false,
      renderCell: (p: GridRenderCellParams<GeneModel & { id: number }>) => (
        <GenomeLink
          refName={p.row.seqName}
          start={p.row.start}
          end={p.row.end}
          assemblyName={assemblyName}
        />
      ),
    },
  ]

  const rows = geneModels.map((gm, i) => ({ id: i, ...gm }))

  return (
    <>
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
            miniprot — {geneModels.length} gene model
            {geneModels.length === 1 ? '' : 's'}
          </Typography>
          {geneModels.length > 0 && assemblyName ? (
            <Button size="small" variant="outlined" onClick={handleViewAll}>
              View all in JBrowse ↗
            </Button>
          ) : null}
        </Box>
        {geneModels.length === 0 ? (
          <Box sx={{ p: 2 }}>
            <Typography variant="body2" color="text.secondary">
              No gene models found.
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
      {gff3 ? (
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, gap: 1 }}>
            <Typography variant="subtitle2">GFF3 Output</Typography>
            <Button size="small" variant="outlined" onClick={handleCopyGff3}>
              {gff3Copied ? 'Copied!' : 'Copy GFF3'}
            </Button>
          </Box>
          <Box
            component="pre"
            sx={{
              fontSize: '0.75rem',
              fontFamily: 'monospace',
              overflow: 'auto',
              bgcolor: 'grey.50',
              p: 1,
              borderRadius: 1,
              maxHeight: 400,
            }}
          >
            {gff3}
          </Box>
        </Paper>
      ) : null}
    </>
  )
}
