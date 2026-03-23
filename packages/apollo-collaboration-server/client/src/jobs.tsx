import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Container from '@mui/material/Container'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
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

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString()
}

function jobDescription(job: AnalysisJob) {
  const { params } = job
  if (job.tool === 'tiberius' && params.refSeqName) {
    const start = Number(params.start ?? 0)
    const end = Number(params.end ?? 0)
    return `${params.refSeqName}:${start.toLocaleString()}-${end.toLocaleString()}`
  }
  if (params.program && params.database) {
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

        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Status</TableCell>
                <TableCell>Tool</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Error</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job._id} hover>
                  <TableCell>
                    <Chip
                      label={job.status}
                      size="small"
                      color={statusColor(job.status)}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>{job.tool}</TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                    >
                      {jobDescription(job)}
                    </Typography>
                  </TableCell>
                  <TableCell>{formatDate(job.createdAt)}</TableCell>
                  <TableCell>
                    {job.error ? (
                      <Typography
                        variant="body2"
                        color="error"
                        sx={{
                          maxWidth: 300,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={job.error}
                      >
                        {job.error}
                      </Typography>
                    ) : null}
                  </TableCell>
                  <TableCell align="right">
                    {job.status === 'pending' || job.status === 'running' ? (
                      <Button
                        size="small"
                        color="error"
                        onClick={() => {
                          void cancelJob(job._id)
                        }}
                      >
                        Cancel
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
              {jobs.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    align="center"
                    sx={{ color: 'text.secondary' }}
                  >
                    No analysis jobs
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </TableContainer>
      </Container>
    </AdminNav>
  )
}

const root = document.querySelector('#root')
if (root) {
  createRoot(root).render(<JobsPage />)
}
