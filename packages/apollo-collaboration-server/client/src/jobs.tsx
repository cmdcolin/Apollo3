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

interface TiberiusJob {
  _id: string
  status: string
  assemblyId: string
  refSeqName: string
  start: number
  end: number
  modelCfg?: string
  trackConfigId?: string
  error?: string
  createdBy?: string
  createdAt: string
  startedAt?: string
}

interface BlastJob {
  _id: string
  status: string
  program: string
  database: string
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

function JobsPage() {
  const [tiberiusJobs, setTiberiusJobs] = useState<TiberiusJob[]>([])
  const [blastJobs, setBlastJobs] = useState<BlastJob[]>([])
  const [error, setError] = useState<string>()

  const load = useCallback(async () => {
    try {
      setError(undefined)
      const [tJobs, bJobs] = await Promise.all([
        fetchJson<TiberiusJob[]>('/tools/tiberius/jobs'),
        fetchJson<BlastJob[]>('/analysis/jobs').catch(() => [] as BlastJob[]),
      ])
      setTiberiusJobs(tJobs)
      setBlastJobs(bJobs)
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function cancelTiberiusJob(jobId: string) {
    try {
      await fetch(`/tools/tiberius/jobs/${jobId}`, { method: 'DELETE' })
      await load()
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_))
    }
  }

  async function cancelBlastJob(jobId: string) {
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

        <Typography variant="h6" sx={{ mb: 1 }}>
          Tiberius Gene Predictions ({tiberiusJobs.length})
        </Typography>
        <TableContainer component={Paper} variant="outlined" sx={{ mb: 4 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Status</TableCell>
                <TableCell>Region</TableCell>
                <TableCell>Model</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Error</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tiberiusJobs.map((job) => (
                <TableRow key={job._id} hover>
                  <TableCell>
                    <Chip
                      label={job.status}
                      size="small"
                      color={statusColor(job.status)}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                    >
                      {job.refSeqName}:{job.start.toLocaleString()}-
                      {job.end.toLocaleString()}
                    </Typography>
                  </TableCell>
                  <TableCell>{job.modelCfg ?? ''}</TableCell>
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
                          void cancelTiberiusJob(job._id)
                        }}
                      >
                        Cancel
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
              {tiberiusJobs.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    align="center"
                    sx={{ color: 'text.secondary' }}
                  >
                    No Tiberius jobs
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </TableContainer>

        <Typography variant="h6" sx={{ mb: 1 }}>
          Sequence Search Jobs ({blastJobs.length})
        </Typography>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Status</TableCell>
                <TableCell>Program</TableCell>
                <TableCell>Database</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Error</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {blastJobs.map((job) => (
                <TableRow key={job._id} hover>
                  <TableCell>
                    <Chip
                      label={job.status}
                      size="small"
                      color={statusColor(job.status)}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>{job.program}</TableCell>
                  <TableCell>{job.database}</TableCell>
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
                          void cancelBlastJob(job._id)
                        }}
                      >
                        Cancel
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
              {blastJobs.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    align="center"
                    sx={{ color: 'text.secondary' }}
                  >
                    No sequence search jobs
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
