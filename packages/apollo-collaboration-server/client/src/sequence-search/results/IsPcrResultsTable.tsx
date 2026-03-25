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
import type { IsPcrProduct } from '../types.js'

export function IsPcrResultsTable({
  products,
  assemblyName,
}: {
  products: IsPcrProduct[]
  assemblyName: string
}) {
  function handleViewAll() {
    const features: JBrowseFeature[] = products.map((p, i) => ({
      uniqueId: `ispcr-${i}`,
      refName: p.seqName,
      start: p.start,
      end: p.end,
      name: `product-${i + 1} (${p.size} bp)`,
      strand: p.strand === '-' ? -1 : 1,
    }))
    const url = buildJBrowseUrl(features, 'isPCR Products', assemblyName)
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  const columns: GridColDef<IsPcrProduct & { id: number }>[] = [
    { field: 'strand', headerName: 'Strand', width: 70 },
    { field: 'size', headerName: 'Size (bp)', type: 'number', width: 100 },
    {
      field: 'location',
      headerName: 'Location',
      width: 220,
      sortable: false,
      renderCell: (p: GridRenderCellParams<IsPcrProduct & { id: number }>) => (
        <GenomeLink
          refName={p.row.seqName}
          start={p.row.start}
          end={p.row.end}
          assemblyName={assemblyName}
        />
      ),
    },
  ]

  const rows = products.map((p, i) => ({ id: i, ...p }))

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
          isPCR — {products.length} product{products.length === 1 ? '' : 's'}
        </Typography>
        {products.length > 0 && assemblyName ? (
          <Button size="small" variant="outlined" onClick={handleViewAll}>
            View all in JBrowse ↗
          </Button>
        ) : null}
      </Box>

      {products.length === 0 ? (
        <Box sx={{ p: 2 }}>
          <Typography variant="body2" color="text.secondary">
            No products found. Check primer sequences, or increase max product
            size.
          </Typography>
        </Box>
      ) : (
        <>
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
          {products.map((p, i) => (
            <Box key={i} sx={{ px: 2, pb: 2 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', mb: 0.5 }}
              >
                Product {i + 1} — {p.seqName}:{p.start}–{p.end} ({p.size} bp)
              </Typography>
              <Box
                component="pre"
                sx={{
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                  overflow: 'auto',
                  bgcolor: 'grey.50',
                  p: 1,
                  borderRadius: 1,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {p.sequence}
              </Box>
            </Box>
          ))}
        </>
      )}
    </Paper>
  )
}
