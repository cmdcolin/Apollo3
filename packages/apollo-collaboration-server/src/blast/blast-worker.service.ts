import { MikroORM, RequestContext } from '@mikro-orm/core'
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common'

import { DatabaseService } from '../mikro-orm/database.service.js'

const NCBI_FETCH_TIMEOUT = 60_000
const POLL_INTERVAL = 5000
const JOB_RETENTION_MS = 86_400_000

@Injectable()
export class BlastWorkerService implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(MikroORM) private readonly orm: MikroORM,
  ) {
    this.maxConcurrent = Number(
      process.env.BLAST_MAX_CONCURRENT_JOBS ?? '1',
    )
    this.jobTimeoutMs =
      Number(process.env.BLAST_JOB_TIMEOUT_MINUTES ?? '1') * 60_000
  }

  async onModuleInit() {
    await RequestContext.create(this.orm.em, async () => {
      const reset = await this.db.blastJob.resetOrphanedRunning()
      if (reset > 0) {
        this.logger.warn(`Reset ${reset} orphaned running BLAST jobs to pending`)
      }
    })
    this.timer = setInterval(() => {
      void this.tick()
    }, POLL_INTERVAL)
    this.logger.log(
      `BLAST worker started: maxConcurrent=${this.maxConcurrent}, timeout=${this.jobTimeoutMs / 1000}s`,
    )
  }

  private readonly logger = new Logger(BlastWorkerService.name)
  private readonly maxConcurrent: number
  private readonly jobTimeoutMs: number
  private timer?: ReturnType<typeof setInterval>
  private readonly activeAborts = new Map<string, AbortController>()
  private ticking = false

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer)
    }
    for (const [, controller] of this.activeAborts) {
      controller.abort()
    }
  }

  private async tick() {
    if (this.ticking) {
      return
    }
    this.ticking = true
    try {
      await RequestContext.create(this.orm.em, async () => {
        await this.expireTimedOutJobs()
        await this.cleanupOldJobs()
        await this.processNextJob()
      })
    } catch (error) {
      this.logger.error('Worker tick failed:', error)
    } finally {
      this.ticking = false
    }
  }

  private async expireTimedOutJobs() {
    const cutoff = new Date(Date.now() - this.jobTimeoutMs)
    const expired = await this.db.blastJob.findRunningOlderThan(cutoff)
    for (const job of expired) {
      this.logger.warn(`BLAST job ${job._id} timed out, cancelling`)
      const controller = this.activeAborts.get(job._id)
      if (controller) {
        controller.abort()
        this.activeAborts.delete(job._id)
      }
      await this.db.blastJob.updateById(job._id, {
        status: 'failed',
        error: `Timed out after ${this.jobTimeoutMs / 1000} seconds`,
      })
    }
  }

  private async cleanupOldJobs() {
    const cutoff = new Date(Date.now() - JOB_RETENTION_MS)
    const deleted = await this.db.blastJob.deleteCompletedOlderThan(cutoff)
    if (deleted > 0) {
      this.logger.log(`Cleaned up ${deleted} old BLAST jobs`)
    }
  }

  private async processNextJob() {
    const runningCount = await this.db.blastJob.countByStatus('running')
    if (runningCount >= this.maxConcurrent) {
      return
    }

    const pending = await this.db.blastJob.findPending(1)
    if (pending.length === 0) {
      return
    }

    const [job] = pending
    this.logger.log(
      `Processing BLAST job ${job._id}: ${job.program} against ${job.database}`,
    )

    await this.db.blastJob.updateById(job._id, {
      status: 'running',
      startedAt: new Date(),
    })

    const abortController = new AbortController()
    this.activeAborts.set(job._id, abortController)

    void this.runJob(job._id, job.program, job.database, job.query, abortController.signal)
  }

  private async runJob(
    jobId: string,
    program: string,
    database: string,
    query: string,
    signal: AbortSignal,
  ) {
    try {
      await RequestContext.create(this.orm.em, async () => {
        const ncbiRid = await this.submitToNcbi(program, database, query, signal)

        await this.db.blastJob.updateById(jobId, { ncbiRid })
        this.logger.log(`BLAST job ${jobId}: NCBI RID=${ncbiRid}`)

        const results = await this.pollNcbiResults(jobId, ncbiRid, signal)

        await this.db.blastJob.updateById(jobId, {
          status: 'ready',
          results,
        })
        this.logger.log(`BLAST job ${jobId} completed`)
      })
    } catch (error) {
      if (signal.aborted) {
        this.logger.log(`BLAST job ${jobId} was aborted`)
        return
      }
      const msg = error instanceof Error ? error.message : String(error)
      this.logger.error(`BLAST job ${jobId} failed: ${msg}`)
      await RequestContext.create(this.orm.em, async () => {
        await this.db.blastJob.updateById(jobId, {
          status: 'failed',
          error: msg,
        })
      })
    } finally {
      this.activeAborts.delete(jobId)
    }
  }

  private async submitToNcbi(
    program: string,
    database: string,
    query: string,
    signal: AbortSignal,
  ) {
    const formData = new URLSearchParams({
      CMD: 'Put',
      PROGRAM: program,
      DATABASE: database,
      QUERY: query,
    })

    const response = await fetch(
      'https://blast.ncbi.nlm.nih.gov/blast/Blast.cgi',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
        signal: AbortSignal.any([signal, AbortSignal.timeout(NCBI_FETCH_TIMEOUT)]),
      },
    )

    const text = await response.text()
    const ridMatch = /RID = (\S+)/.exec(text)
    if (!ridMatch) {
      throw new Error(
        `NCBI did not return an RID: ${text.slice(0, 500)}`,
      )
    }
    return ridMatch[1]
  }

  private async pollNcbiResults(
    jobId: string,
    ncbiRid: string,
    signal: AbortSignal,
  ) {
    let waitMs = 10_000
    for (let attempt = 0; attempt < 120; attempt++) {
      await this.delay(waitMs, signal)

      const cancelled = await RequestContext.create(this.orm.em, async () => {
        const current = await this.db.blastJob.findById(jobId)
        return current?.status === 'cancelled'
      })
      if (cancelled) {
        throw new Error('Job was cancelled')
      }

      const statusResponse = await fetch(
        `https://blast.ncbi.nlm.nih.gov/blast/Blast.cgi?CMD=Get&FORMAT_OBJECT=SearchInfo&RID=${encodeURIComponent(ncbiRid)}`,
        {
          signal: AbortSignal.any([
            signal,
            AbortSignal.timeout(NCBI_FETCH_TIMEOUT),
          ]),
        },
      )
      const statusText = await statusResponse.text()
      const statusMatch = /Status=(\S+)/.exec(statusText)
      const status = statusMatch?.[1] ?? 'UNKNOWN'

      if (status === 'READY') {
        const resultsResponse = await fetch(
          `https://blast.ncbi.nlm.nih.gov/blast/Blast.cgi?CMD=Get&FORMAT_TYPE=JSON2_S&RID=${encodeURIComponent(ncbiRid)}`,
          {
            signal: AbortSignal.any([
              signal,
              AbortSignal.timeout(NCBI_FETCH_TIMEOUT),
            ]),
          },
        )
        if (!resultsResponse.ok) {
          throw new Error(
            `Failed to fetch results: ${resultsResponse.status}`,
          )
        }
        return resultsResponse.json()
      }
      if (status === 'FAILED') {
        throw new Error('NCBI BLAST search failed')
      }

      waitMs = 10_000
    }
    throw new Error('NCBI polling exceeded maximum attempts')
  }

  private delay(ms: number, signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      const abortError = new Error('Aborted')
      if (signal.aborted) {
        reject(abortError)
        return
      }
      const timer = setTimeout(resolve, ms)
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer)
          reject(abortError)
        },
        { once: true },
      )
    })
  }
}
