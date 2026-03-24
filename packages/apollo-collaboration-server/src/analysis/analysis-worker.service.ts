import { MikroORM, RequestContext } from '@mikro-orm/core'
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common'

import { DatabaseService } from '../mikro-orm/database.service.js'
import { SequenceService } from '../sequence/sequence.service.js'

import type { AnalysisRunner } from './runner.js'
import { BlatRunner } from './runners/blat.runner.js'
import { IsPcrRunner } from './runners/ispcr.runner.js'
import { LocalBlastRunner } from './runners/local-blast.runner.js'
import { MiniprotRunner } from './runners/miniprot.runner.js'
import { TiberiusRunner } from './runners/tiberius.runner.js'

const POLL_INTERVAL = 5000
const JOB_RETENTION_MS = 86_400_000

@Injectable()
export class AnalysisWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly runners = new Map<string, AnalysisRunner>()

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(MikroORM) private readonly orm: MikroORM,
    @Inject(SequenceService) private readonly sequenceService: SequenceService,
    @Inject(LocalBlastRunner) localBlast: LocalBlastRunner,
    @Inject(IsPcrRunner) ispcr: IsPcrRunner,
    @Inject(BlatRunner) blat: BlatRunner,
    @Inject(MiniprotRunner) miniprot: MiniprotRunner,
    @Inject(TiberiusRunner) tiberius: TiberiusRunner,
  ) {
    this.runners.set(localBlast.tool, localBlast)
    this.runners.set(ispcr.tool, ispcr)
    this.runners.set(blat.tool, blat)
    this.runners.set(miniprot.tool, miniprot)
    this.runners.set(tiberius.tool, tiberius)

    this.maxConcurrent = Number(process.env.ANALYSIS_MAX_CONCURRENT_JOBS ?? '2')
    this.jobTimeoutMs =
      Number(process.env.ANALYSIS_JOB_TIMEOUT_MINUTES ?? '5') * 60_000
  }

  async onModuleInit() {
    await RequestContext.create(this.orm.em, async () => {
      const reset = await this.db.analysisJob.resetOrphanedRunning()
      if (reset > 0) {
        this.logger.warn(
          `Reset ${reset} orphaned running analysis jobs to pending`,
        )
      }
    })

    for (const [tool, runner] of this.runners) {
      const installed = await runner.isInstalled()
      if (installed) {
        this.logger.log(`${tool}: available`)
      } else {
        this.logger.warn(`${tool}: NOT available (tool not installed)`)
      }
    }

    this.timer = setInterval(() => {
      void this.tick()
    }, POLL_INTERVAL)
    this.logger.log(
      `Analysis worker started: maxConcurrent=${this.maxConcurrent}, timeout=${this.jobTimeoutMs / 1000}s`,
    )
  }

  private readonly logger = new Logger(AnalysisWorkerService.name)
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

  getAvailableTools() {
    return [...this.runners.keys()]
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
    const expired = await this.db.analysisJob.findRunningOlderThan(cutoff)
    for (const job of expired) {
      this.logger.warn(`Analysis job ${job._id} timed out`)
      const controller = this.activeAborts.get(job._id)
      if (controller) {
        controller.abort()
        this.activeAborts.delete(job._id)
      }
      await this.db.analysisJob.updateById(job._id, {
        status: 'failed',
        error: `Timed out after ${this.jobTimeoutMs / 1000} seconds`,
      })
    }
  }

  private async cleanupOldJobs() {
    const cutoff = new Date(Date.now() - JOB_RETENTION_MS)
    const deleted = await this.db.analysisJob.deleteCompletedOlderThan(cutoff)
    if (deleted > 0) {
      this.logger.log(`Cleaned up ${deleted} old analysis jobs`)
    }
  }

  private async processNextJob() {
    const runningCount = await this.db.analysisJob.countByStatus('running')
    if (runningCount >= this.maxConcurrent) {
      return
    }

    const pending = await this.db.analysisJob.findPending(1)
    if (pending.length === 0) {
      return
    }

    const [job] = pending
    const runner = this.runners.get(job.tool)
    if (!runner) {
      this.logger.error(`No runner for tool "${job.tool}"`)
      await this.db.analysisJob.updateById(job._id, {
        status: 'failed',
        error: `Unknown tool: ${job.tool}`,
      })
      return
    }

    this.logger.log(`Processing ${job.tool} job ${job._id}`)
    await this.db.analysisJob.updateById(job._id, {
      status: 'running',
      startedAt: new Date(),
    })

    const abortController = new AbortController()
    this.activeAborts.set(job._id, abortController)

    void this.runJob(job._id, runner, abortController.signal)
  }

  private async runJob(
    jobId: string,
    runner: AnalysisRunner,
    signal: AbortSignal,
  ) {
    try {
      await RequestContext.create(this.orm.em, async () => {
        const job = await this.db.analysisJob.findById(jobId)
        if (!job) {
          throw new Error(`Job ${jobId} not found`)
        }

        const results = await runner.run({
          job,
          db: this.db,
          sequenceService: this.sequenceService,
          signal,
          updateMetadata: async (metadata) => {
            const existing = job.metadata ?? {}
            await this.db.analysisJob.updateById(jobId, {
              metadata: { ...existing, ...metadata },
            })
          },
        })

        await this.db.analysisJob.updateById(jobId, {
          status: 'ready',
          results,
        })
        this.logger.log(`${runner.tool} job ${jobId} completed`)
      })
    } catch (error) {
      if (signal.aborted) {
        this.logger.log(`Job ${jobId} was aborted`)
        return
      }
      const msg = error instanceof Error ? error.message : String(error)
      this.logger.error(`Job ${jobId} failed: ${msg}`)
      await RequestContext.create(this.orm.em, async () => {
        await this.db.analysisJob.updateById(jobId, {
          status: 'failed',
          error: msg,
        })
      })
    } finally {
      this.activeAborts.delete(jobId)
    }
  }
}
