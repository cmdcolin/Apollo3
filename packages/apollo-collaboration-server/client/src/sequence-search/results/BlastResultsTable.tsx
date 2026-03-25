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
} from '../helpers/index.js'
import {
  type BlastHit,
  type BlastHitDescription,
  type BlastSearchResult,
  PROTEIN_PROGRAMS,
} from '../types.js'

function HitAlignment({ hit }: { hit: BlastHit }) {
  const desc = hit.description[0] as BlastHitDescription | undefined

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
        {hit.num}. {desc ? desc.accession : 'Unknown'} —{' '}
        {desc ? desc.title : ''}
      </Typography>
      {hit.hsps.map((hsp, i) => (
        <Box
          key={i}
          component="pre"
          sx={{
            fontSize: '0.75rem',
            fontFamily: 'monospace',
            overflow: 'auto',
            bgcolor: 'grey.50',
            p: 1,
            borderRadius: 1,
            mb: 1,
          }}
        >
          {`Score: ${hsp.bit_score.toFixed(1)} bits  E-value: ${hsp.evalue.toExponential(2)}  Identity: ${hsp.identity}/${hsp.align_len}\n`}
          {`Query  ${String(hsp.query_from).padStart(8)}  ${hsp.qseq}  ${hsp.query_to}\n`}
          {`               ${hsp.midline}\n`}
          {`Sbjct  ${String(hsp.hit_from).padStart(8)}  ${hsp.hseq}  ${hsp.hit_to}`}
        </Box>
      ))}
    </Box>
  )
}

interface BlastRow {
  id: number
  num: number
  accession: string
  title: string
  sciname: string
  bitScore: number
  evalue: number
  identPct: number
  queryFrom: number
  queryTo: number
  hitStart: number
  hitEnd: number
  refName: string
  hit: BlastHit
}

export function BlastResultsTable({
  results,
  program,
  assemblyName,
}: {
  results: BlastSearchResult
  program: string
  assemblyName: string
}) {
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const searchData = results.report?.results?.search
  const hits = searchData?.hits ?? []
  const isProteinResult = PROTEIN_PROGRAMS.has(program)

  function handleViewAll() {
    const features: JBrowseFeature[] = hits.flatMap((hit) => {
      const desc = hit.description[0] as BlastHitDescription | undefined
      if (!desc) {
        return []
      }
      return hit.hsps.map((hsp, i) => ({
        uniqueId: `blast-${hit.num}-${i}`,
        refName: desc.accession,
        // BLAST 1-based inclusive → 0-based half-open
        start: Math.min(hsp.hit_from, hsp.hit_to) - 1,
        end: Math.max(hsp.hit_from, hsp.hit_to),
        name: `${desc.accession} (score ${hsp.bit_score.toFixed(0)})`,
        score: Math.round(hsp.bit_score),
      }))
    })
    const url = buildJBrowseUrl(features, 'BLAST Hits', assemblyName)
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  const rows: BlastRow[] = hits.map((hit) => {
    const desc = hit.description[0] as BlastHitDescription | undefined
    const [topHsp] = hit.hsps
    const identPct =
      topHsp.align_len > 0 ? (topHsp.identity / topHsp.align_len) * 100 : 0
    return {
      id: hit.num,
      num: hit.num,
      accession: desc?.accession ?? '',
      title: desc?.title ?? '',
      sciname: desc?.sciname ?? '',
      bitScore: topHsp.bit_score,
      evalue: topHsp.evalue,
      identPct,
      queryFrom: topHsp.query_from,
      queryTo: topHsp.query_to,
      hitStart: Math.min(topHsp.hit_from, topHsp.hit_to) - 1,
      hitEnd: Math.max(topHsp.hit_from, topHsp.hit_to),
      refName: desc?.accession ?? '',
      hit,
    }
  })

  const columns: GridColDef<BlastRow>[] = [
    { field: 'num', headerName: '#', width: 50 },
    {
      field: 'accession',
      headerName: 'Accession',
      width: 130,
      renderCell: (p: GridRenderCellParams<BlastRow, string>) => (
        <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
          {p.value}
        </span>
      ),
    },
    { field: 'title', headerName: 'Description', flex: 1, minWidth: 200 },
    ...(isProteinResult
      ? []
      : [
          {
            field: 'sciname',
            headerName: 'Organism',
            width: 160,
            renderCell: (p: GridRenderCellParams<BlastRow, string>) => (
              <em>{p.value}</em>
            ),
          } as GridColDef<BlastRow>,
        ]),
    {
      field: 'bitScore',
      headerName: 'Score',
      type: 'number',
      width: 80,
      valueFormatter: (value: number) => value.toFixed(1),
    },
    {
      field: 'evalue',
      headerName: 'E-value',
      type: 'number',
      width: 90,
      valueFormatter: (value: number) => value.toExponential(2),
    },
    {
      field: 'identPct',
      headerName: 'Identity',
      type: 'number',
      width: 80,
      valueFormatter: (value: number) => `${value.toFixed(1)}%`,
    },
    {
      field: 'queryRange',
      headerName: 'Query',
      width: 100,
      sortable: false,
      valueGetter: (_value: unknown, row: BlastRow) =>
        `${row.queryFrom}–${row.queryTo}`,
    },
    {
      field: 'location',
      headerName: 'Location',
      width: 220,
      sortable: false,
      renderCell: (p: GridRenderCellParams<BlastRow>) => (
        <GenomeLink
          refName={p.row.refName}
          start={p.row.hitStart}
          end={p.row.hitEnd}
          assemblyName={assemblyName}
        />
      ),
    },
  ]

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
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
          <Typography variant="h6">
            {hits.length} hit{hits.length === 1 ? '' : 's'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {program}
            {searchData?.query_len
              ? ` · query length ${searchData.query_len.toLocaleString()} bp`
              : ''}
            {searchData?.stat?.db_num
              ? ` · ${searchData.stat.db_num.toLocaleString()} sequences in database`
              : ''}
          </Typography>
        </Box>
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
        <>
          <DataGrid
            rows={rows}
            columns={columns}
            density="compact"
            disableRowSelectionOnClick
            autoHeight
            pageSizeOptions={[25, 50, 100]}
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            onRowClick={({ id }) => {
              setExpandedId(
                expandedId === (id as number) ? null : (id as number),
              )
            }}
            sx={{
              border: 'none',
              borderTop: 1,
              borderColor: 'divider',
              cursor: 'pointer',
            }}
          />
          {expandedId === null ? null : (
            <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
              {rows
                .filter((r) => r.id === expandedId)
                .map((r) => (
                  <HitAlignment key={r.id} hit={r.hit} />
                ))}
            </Box>
          )}
          <Box sx={{ p: 1.5 }}>
            <Typography variant="caption" color="text.secondary">
              Click a row to expand alignment details.
            </Typography>
          </Box>
        </>
      )}
    </Paper>
  )
}
