import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import {
  DataGrid,
  type GridColDef,
  type GridRenderCellParams,
} from '@mui/x-data-grid'
import { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { AdminNav } from './Nav.js'
import { fetchJson } from './fetchUtil.js'

interface AnalysisJob {
  _id: string
  status: string
  tool: string
  assemblyId?: string
  params: Record<string, unknown>
  results?: unknown
  error?: string
  createdBy?: string
  createdAt: string
  startedAt?: string
}

type StatusColor = 'default' | 'primary' | 'success' | 'error' | 'warning'

function statusColor(status: string): StatusColor {
  switch (status) {
    case 'pending': {
      return 'default'
    }
    case 'running': {
      return 'primary'
    }
    case 'ready': {
      return 'success'
    }
    case 'failed': {
      return 'error'
    }
    case 'cancelled': {
      return 'warning'
    }
    default: {
      return 'default'
    }
  }
}

function jobDescription(job: AnalysisJob) {
  const { params } = job
  if (job.tool === 'tiberius' && typeof params.refSeqName === 'string') {
    const start = Number(params.start ?? 0)
    const end = Number(params.end ?? 0)
    return `${params.refSeqName}:${start.toLocaleString()}-${end.toLocaleString()}`
  }
  if (
    typeof params.program === 'string' &&
    typeof params.database === 'string'
  ) {
    return `${params.program} / ${params.database}`
  }
  return JSON.stringify(params).slice(0, 80)
}

function JobsPage() {
  const [jobs, setJobs] = useState<AnalysisJob[]>([])
  const [error, setError] = useState<string>()

  const load = useCallback(async () => {
    try {
      setError(undefined)
      const result = await fetchJson<AnalysisJob[]>('/analysis/jobs')
      setJobs(result)
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function cancelJob(jobId: string) {
    try {
      await fetch(`/analysis/jobs/${jobId}`, { method: 'DELETE' })
      await load()
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_))
    }
  }

  const columns: GridColDef<AnalysisJob>[] = [
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
      renderCell: (
        params: GridRenderCellParams<AnalysisJob, AnalysisJob['status']>,
      ) => (
        <Chip
          label={params.value}
          size="small"
          color={statusColor(params.value)}
          variant="outlined"
        />
      ),
    },
    { field: 'tool', headerName: 'Tool', width: 120 },
    {
      field: 'description',
      headerName: 'Description',
      flex: 2,
      sortable: false,
      valueGetter: (_value, row) => jobDescription(row),
    },
    {
      field: 'createdAt',
      headerName: 'Created',
      flex: 1,
      valueFormatter: (value: string) => new Date(value).toLocaleString(),
    },
    {
      field: 'error',
      headerName: 'Error',
      flex: 1.5,
      renderCell: (
        params: GridRenderCellParams<AnalysisJob, AnalysisJob['error']>,
      ) =>
        params.value ? (
          <Typography
            variant="body2"
            color="error"
            sx={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={params.value}
          >
            {params.value}
          </Typography>
        ) : null,
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 100,
      sortable: false,
      align: 'right',
      headerAlign: 'right',
      renderCell: (params) =>
        params.row.status === 'pending' || params.row.status === 'running' ? (
          <Button
            size="small"
            color="error"
            onClick={() => {
              void cancelJob(params.row._id)
            }}
          >
            Cancel
          </Button>
        ) : null,
    },
  ]

  return (
    <AdminNav current="jobs">
      <Container>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Typography variant="h4">Analysis Jobs</Typography>
          <Button
            variant="outlined"
            size="small"
            onClick={() => {
              void load()
            }}
          >
            Refresh
          </Button>
        </Box>

        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}

        <Box sx={{ height: 600 }}>
          <DataGrid
            rows={jobs.map((j) => ({ ...j, id: j._id }))}
            columns={columns}
            density="compact"
            pageSizeOptions={[25, 50, 100]}
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          />
        </Box>
      </Container>
    </AdminNav>
  )
}

const root = document.querySelector('#root')
if (root) {
  createRoot(root).render(<JobsPage />)
}
