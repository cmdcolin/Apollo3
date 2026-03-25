import { useCallback, useState } from 'react'

import { fetchJson } from '../../fetchUtil.js'
import { JOB_POLL_INTERVAL, MAX_POLL_ATTEMPTS } from '../types.js'

interface AnalysisJob {
  _id: string
  status: string
  tool: string
  params: Record<string, unknown>
  results?: unknown
  error?: string
}

export interface SearchState {
  submitting: boolean
  jobId?: string
  status?: string
  tool?: string
  assemblyId?: string
  params?: Record<string, unknown>
  results?: unknown
  error?: string
  submit: (
    tool: string,
    params: Record<string, unknown>,
    assemblyId?: string,
  ) => void
  cancel: () => void
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

export function useAnalysisSearch(): SearchState {
  const [submitting, setSubmitting] = useState(false)
  const [jobId, setJobId] = useState<string>()
  const [status, setStatus] = useState<string>()
  const [tool, setTool] = useState<string>()
  const [assemblyId, setAssemblyId] = useState<string>()
  const [params, setParams] = useState<Record<string, unknown>>()
  const [results, setResults] = useState<unknown>()
  const [error, setError] = useState<string>()

  const submit = useCallback(
    (eng: string, jobParams: Record<string, unknown>, assemblyId?: string) => {
      setSubmitting(true)
      setError(undefined)
      setResults(undefined)
      setStatus(undefined)
      setJobId(undefined)
      setTool(eng)
      setAssemblyId(assemblyId)
      setParams(jobParams)

      async function run() {
        const response = await fetch('/analysis/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tool: eng, params: jobParams, assemblyId }),
        })
        if (!response.ok) {
          const text = await response.text()
          throw new Error(`${response.status}: ${text}`)
        }
        const job = (await response.json()) as AnalysisJob
        setJobId(job._id)
        setStatus(job.status)

        for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
          await delay(JOB_POLL_INTERVAL)
          const current = await fetchJson<AnalysisJob>(
            `/analysis/jobs/${job._id}`,
          )
          setStatus(current.status)

          if (current.status === 'ready') {
            setResults(current.results)
            return
          }
          if (current.status === 'failed' || current.status === 'cancelled') {
            throw new Error(current.error ?? `Job ${current.status}`)
          }
        }
        throw new Error('Search timed out after too many polling attempts')
      }

      void run()
        .catch((error_: unknown) => {
          setError(error_ instanceof Error ? error_.message : String(error_))
        })
        .finally(() => {
          setSubmitting(false)
        })
    },
    [],
  )

  const cancel = useCallback(() => {
    if (!jobId) {
      return
    }
    void fetch(`/analysis/jobs/${jobId}`, { method: 'DELETE' }).catch(
      (error_: unknown) => {
        console.error('Failed to cancel job', error_)
      },
    )
  }, [jobId])

  return {
    submitting,
    jobId,
    status,
    tool,
    assemblyId,
    params,
    results,
    error,
    submit,
    cancel,
  }
}
