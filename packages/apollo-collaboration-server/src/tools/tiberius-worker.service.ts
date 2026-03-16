import { type ChildProcess, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'

import { MikroORM, RequestContext } from '@mikro-orm/core'
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { ToolsConfigService } from '../config/tools-config.service.js'
import { DatabaseService } from '../mikro-orm/database.service.js'
import { SequenceService } from '../sequence/sequence.service.js'

import { rewriteGtfCoordinates } from './gtf-rewriter.js'

const POLL_INTERVAL = 5000
const DEFAULT_FAILED_RETENTION_DAYS = 1
const DEFAULT_COMPLETED_RETENTION_DAYS = 0 // 0 = never auto-delete
// Shared env var name — BLAST worker should use the same when migrated
const RETENTION_ENV_PREFIX = 'ANALYSIS'

@Injectable()
export class TiberiusWorkerService implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(MikroORM) private readonly orm: MikroORM,
    @Inject(SequenceService) private readonly sequenceService: SequenceService,
    @Inject(ToolsConfigService)
    private readonly toolsConfig: ToolsConfigService,
    @Inject(ConfigService)
    private readonly configService: ConfigService<{
      FILE_UPLOAD_FOLDER: string
      URL: string
    }>,
  ) {
    this.maxConcurrent = Number(
      process.env.TIBERIUS_MAX_CONCURRENT_JOBS ?? '1',
    )
    this.jobTimeoutMs =
      Number(process.env.TIBERIUS_JOB_TIMEOUT_MINUTES ?? '60') * 60_000
    this.failedRetentionMs =
      Number(process.env[`${RETENTION_ENV_PREFIX}_FAILED_RETENTION_DAYS`] ?? DEFAULT_FAILED_RETENTION_DAYS) * 86_400_000
    this.completedRetentionMs =
      Number(process.env[`${RETENTION_ENV_PREFIX}_COMPLETED_RETENTION_DAYS`] ?? DEFAULT_COMPLETED_RETENTION_DAYS) * 86_400_000
  }

  private readonly logger = new Logger(TiberiusWorkerService.name)
  private readonly maxConcurrent: number
  private readonly jobTimeoutMs: number
  private readonly failedRetentionMs: number
  private readonly completedRetentionMs: number
  private timer?: ReturnType<typeof setInterval>
  private readonly activeProcesses = new Map<string, ChildProcess>()
  private ticking = false

  async onModuleInit() {
    await RequestContext.create(this.orm.em, async () => {
      const reset = await this.db.tiberiusJob.resetOrphanedRunning()
      if (reset > 0) {
        this.logger.warn(
          `Reset ${reset} orphaned running Tiberius jobs to pending`,
        )
      }
    })
    this.timer = setInterval(() => {
      void this.tick()
    }, POLL_INTERVAL)
    this.logger.log(
      `Tiberius worker started: maxConcurrent=${this.maxConcurrent}, timeout=${this.jobTimeoutMs / 1000}s`,
    )
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer)
    }
    for (const [, child] of this.activeProcesses) {
      if (!child.killed) {
        child.kill('SIGTERM')
      }
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
      this.logger.error('Tiberius worker tick failed:', error)
    } finally {
      this.ticking = false
    }
  }

  private async expireTimedOutJobs() {
    const cutoff = new Date(Date.now() - this.jobTimeoutMs)
    const expired = await this.db.tiberiusJob.findRunningOlderThan(cutoff)
    for (const job of expired) {
      this.logger.warn(`Tiberius job ${job._id} timed out`)
      const child = this.activeProcesses.get(job._id)
      if (child && !child.killed) {
        child.kill('SIGTERM')
      }
      this.activeProcesses.delete(job._id)
      await this.db.tiberiusJob.updateById(job._id, {
        status: 'failed',
        error: `Timed out after ${this.jobTimeoutMs / 1000} seconds`,
      })
    }
  }

  private async cleanupOldJobs() {
    // Always clean up failed/cancelled jobs after retention period
    if (this.failedRetentionMs > 0) {
      const failedCutoff = new Date(Date.now() - this.failedRetentionMs)
      const deleted = await this.db.tiberiusJob.deleteOlderThan(failedCutoff, [
        'failed',
        'cancelled',
      ])
      if (deleted.length > 0) {
        this.logger.log(`Cleaned up ${deleted.length} failed/cancelled Tiberius jobs`)
        for (const job of deleted) {
          this.cleanupJobDir(job._id)
        }
      }
    }

    // Optionally clean up completed jobs (disabled by default, set TIBERIUS_COMPLETED_RETENTION_DAYS to enable)
    if (this.completedRetentionMs > 0) {
      const completedCutoff = new Date(Date.now() - this.completedRetentionMs)
      const deleted = await this.db.tiberiusJob.deleteOlderThan(completedCutoff, [
        'ready',
      ])
      if (deleted.length > 0) {
        this.logger.log(`Cleaned up ${deleted.length} old completed Tiberius jobs`)
        for (const job of deleted) {
          this.cleanupJobDir(job._id)
          if (job.trackConfigId) {
            await this.db.trackConfig.deleteById(job.trackConfigId).catch(() => {
              // track may already be deleted
            })
          }
        }
      }
    }
  }

  private async processNextJob() {
    const runningCount = await this.db.tiberiusJob.countByStatus('running')
    if (runningCount >= this.maxConcurrent) {
      return
    }

    const pending = await this.db.tiberiusJob.findPending(1)
    if (pending.length === 0) {
      return
    }

    const [job] = pending
    this.logger.log(
      `Processing Tiberius job ${job._id}: ${job.refSeqName}:${job.start}-${job.end}`,
    )

    await this.db.tiberiusJob.updateById(job._id, {
      status: 'running',
      startedAt: new Date(),
    })

    void this.runJob(job._id, job)
  }

  private async runJob(
    jobId: string,
    job: { assemblyId: string; refSeqId: string; refSeqName: string; start: number; end: number; modelCfg?: string; useSingularity: boolean; createdBy?: string },
  ) {
    try {
      await RequestContext.create(this.orm.em, async () => {
        const config = this.toolsConfig.getToolConfig('tiberius')
        if (!config?.enabled) {
          throw new Error('Tiberius is not available')
        }

        const sequence = await this.sequenceService.getSequence({
          refSeq: job.refSeqId,
          start: job.start,
          end: job.end,
        })

        const fileUploadFolder = this.configService.get('FILE_UPLOAD_FOLDER', {
          infer: true,
        })!
        const jobDir = join(fileUploadFolder, 'tiberius-jobs', jobId)
        mkdirSync(jobDir, { recursive: true })

        const inputPath = join(jobDir, 'input.fasta')
        const outputPath = join(jobDir, 'output.gtf')
        const fastaContent = `>${job.refSeqName}:${job.start}-${job.end}\n${sequence}\n`
        writeFileSync(inputPath, fastaContent)

        const { executable, args } = this.buildTiberiusCommand(
          {
            ...config,
            modelCfg: job.modelCfg || config.modelCfg,
            useSingularity: job.useSingularity,
          },
          inputPath,
          outputPath,
        )

        this.logger.log(
          `Starting Tiberius process for job ${jobId}: ${executable} ${args.join(' ')}`,
        )

        await this.spawnAndWait(jobId, executable, args, jobDir)

        if (!existsSync(outputPath)) {
          throw new Error('Tiberius did not produce output')
        }

        const rawGtf = readFileSync(outputPath, 'utf8')
        const rewrittenGtf = rewriteGtfCoordinates(
          rawGtf,
          job.refSeqName,
          job.start,
        )
        const finalGtfPath = join(jobDir, 'predictions.gtf')
        writeFileSync(finalGtfPath, rewrittenGtf)

        const serverUrl = this.configService.get('URL', { infer: true })!
        const trackId = `tiberius_${jobId}`
        const trackConfigId = randomBytes(12).toString('hex')

        await this.db.trackConfig.create({
          _id: trackConfigId,
          trackId,
          assemblyIds: [job.assemblyId],
          config: {
            type: 'FeatureTrack',
            trackId,
            name: `Tiberius: ${job.refSeqName}:${job.start.toLocaleString()}-${job.end.toLocaleString()}`,
            category: ['Gene Predictions'],
            assemblyNames: [job.assemblyId],
            adapter: {
              type: 'GtfAdapter',
              gtfLocation: {
                uri: `${serverUrl}/tools/tiberius/files/${jobId}/predictions.gtf`,
                locationType: 'UriLocation',
              },
            },
          },
          createdBy: job.createdBy,
        })

        await this.db.tiberiusJob.updateById(jobId, {
          status: 'ready',
          trackConfigId,
        })

        this.logger.log(`Tiberius job ${jobId} completed, track ${trackId} created`)

        // Clean up intermediate files, keep predictions.gtf
        try {
          const inputFile = join(jobDir, 'input.fasta')
          if (existsSync(inputFile)) {
            rmSync(inputFile)
          }
          if (existsSync(outputPath)) {
            rmSync(outputPath)
          }
        } catch {
          // non-critical cleanup
        }
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      this.logger.error(`Tiberius job ${jobId} failed: ${msg}`)
      await RequestContext.create(this.orm.em, async () => {
        const current = await this.db.tiberiusJob.findById(jobId)
        if (current?.status === 'cancelled') {
          return
        }
        await this.db.tiberiusJob.updateById(jobId, {
          status: 'failed',
          error: msg,
        })
      })
      this.cleanupJobDir(jobId)
    } finally {
      this.activeProcesses.delete(jobId)
    }
  }

  private spawnAndWait(
    jobId: string,
    executable: string,
    args: string[],
    cwd: string,
  ) {
    return new Promise<void>((resolve, reject) => {
      const child = spawn(executable, args, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      this.activeProcesses.set(jobId, child)

      let stderr = ''
      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      child.on('close', (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(
            new Error(
              stderr.slice(0, 1000) || `Tiberius exited with code ${code}`,
            ),
          )
        }
      })

      child.on('error', (err) => {
        reject(err)
      })
    })
  }

  private buildTiberiusCommand(
    config: {
      tiberiusPath: string
      modelCfg?: string
      useSingularity: boolean
    },
    inputPath: string,
    outputPath: string,
  ) {
    // tiberius.py handles singularity internally via its --singularity flag.
    // We just call: python3 tiberius.py --genome input.fa --out output.gtf [--singularity] [--model_cfg ...]
    const args = [
      config.tiberiusPath,
      '--genome',
      inputPath,
      '--out',
      outputPath,
    ]

    if (config.useSingularity) {
      args.push('--singularity')
    }

    if (config.modelCfg) {
      args.push('--model_cfg', config.modelCfg)
    }

    return { executable: 'python3', args }
  }

  private cleanupJobDir(jobId: string) {
    try {
      const fileUploadFolder = this.configService.get('FILE_UPLOAD_FOLDER', {
        infer: true,
      })!
      const jobDir = join(fileUploadFolder, 'tiberius-jobs', jobId)
      if (existsSync(jobDir)) {
        rmSync(jobDir, { recursive: true, force: true })
      }
    } catch (error) {
      this.logger.warn(`Failed to clean up Tiberius job dir: ${error}`)
    }
  }
}
