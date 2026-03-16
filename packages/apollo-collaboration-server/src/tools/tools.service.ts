import { type ChildProcess, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { AddFeatureChange, type DecodedJWT } from '@apollo-annotation/shared'
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { ChangesService } from '../changes/changes.service.js'
import { ToolsConfigService } from '../config/tools-config.service.js'
import { DatabaseService } from '../mikro-orm/database.service.js'
import { SequenceService } from '../sequence/sequence.service.js'

import { parseGtf } from './gtf-parser.js'

type JobStatus = 'running' | 'completed' | 'failed'

interface TiberiusJob {
  jobId: string
  status: JobStatus
  message?: string
  featureIds?: string[]
  process?: ChildProcess
}

@Injectable()
export class ToolsService implements OnModuleDestroy {
  constructor(
    @Inject(ToolsConfigService)
    private readonly toolsConfig: ToolsConfigService,
    @Inject(SequenceService) private readonly sequenceService: SequenceService,
    @Inject(ConfigService)
    private readonly configService: ConfigService<{
      FILE_UPLOAD_FOLDER: string
    }>,
    @Inject(ChangesService) private readonly changesService: ChangesService,
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  private readonly logger = new Logger(ToolsService.name)
  private jobs = new Map<string, TiberiusJob>()

  onModuleDestroy() {
    for (const [, job] of this.jobs) {
      if (job.process && !job.process.killed) {
        job.process.kill('SIGTERM')
      }
    }
  }

  getTiberiusAvailability() {
    return {
      available: this.toolsConfig.isToolAvailable('tiberius'),
      singularity: this.toolsConfig.isSingularityAvailable(),
      maxRegionSize: this.toolsConfig.getToolConfig('tiberius')?.maxRegionSize,
    }
  }

  getJobStatus(jobId: string) {
    const job = this.jobs.get(jobId)
    if (!job) {
      return
    }
    return {
      jobId: job.jobId,
      status: job.status,
      message: job.message,
      featureIds: job.featureIds,
    }
  }

  async startTiberiusJob(params: {
    assembly: string
    refSeqId: string
    start: number
    end: number
    user: DecodedJWT
  }) {
    const config = this.toolsConfig.getToolConfig('tiberius')
    if (!config?.enabled) {
      throw new Error('Tiberius is not available')
    }

    const regionSize = params.end - params.start
    if (regionSize > config.maxRegionSize) {
      throw new Error(
        `Region size ${regionSize} exceeds maximum ${config.maxRegionSize}`,
      )
    }

    const sequence = await this.sequenceService.getSequence({
      refSeq: params.refSeqId,
      start: params.start,
      end: params.end,
    })

    const refSeq = await this.db.refSeq.findById(params.refSeqId)
    if (!refSeq) {
      throw new Error(`RefSeq "${params.refSeqId}" not found`)
    }

    const jobId = randomUUID()
    const fileUploadFolder = this.configService.get('FILE_UPLOAD_FOLDER', {
      infer: true,
    })!
    const jobDir = join(fileUploadFolder, 'tiberius-jobs', jobId)
    mkdirSync(jobDir, { recursive: true })

    const inputPath = join(jobDir, 'input.fasta')
    const outputPath = join(jobDir, 'output.gtf')
    const fastaContent = `>${refSeq.name}:${params.start}-${params.end}\n${sequence}\n`
    writeFileSync(inputPath, fastaContent)

    const job: TiberiusJob = { jobId, status: 'running' }
    this.jobs.set(jobId, job)

    const args = this.buildTiberiusArgs(config, inputPath, outputPath, jobDir)
    const executable = config.singularity ? 'singularity' : config.executable

    this.logger.log(
      `Starting Tiberius job ${jobId}: ${executable} ${args.join(' ')}`,
    )

    const child = spawn(executable, args, {
      cwd: jobDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    job.process = child

    let stderr = ''
    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    const timeout = setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGTERM')
        job.status = 'failed'
        job.message = 'Tiberius timed out'
        this.logger.warn(`Tiberius job ${jobId} timed out`)
      }
    }, config.timeout)

    child.on('close', (code) => {
      clearTimeout(timeout)
      if (code === 0 && existsSync(outputPath)) {
        void this.handleTiberiusOutput(jobId, outputPath, params, jobDir).catch(
          (error: unknown) => {
            job.status = 'failed'
            job.message = `Failed to import results: ${error}`
            this.logger.error(`Tiberius job ${jobId} import failed: ${error}`)
          },
        )
      } else {
        job.status = 'failed'
        job.message =
          stderr.slice(0, 1000) || `Tiberius exited with code ${code}`
        this.logger.error(`Tiberius job ${jobId} failed: ${job.message}`)
        this.cleanupJobDir(jobDir)
      }
    })

    return { jobId }
  }

  private buildTiberiusArgs(
    config: {
      singularity: boolean
      executable: string
      script?: string
      model?: string
    },
    inputPath: string,
    outputPath: string,
    jobDir: string,
  ) {
    if (config.singularity) {
      const args = ['exec', '--bind', `${jobDir}:${jobDir}`]
      if (config.script) {
        args.push(config.script)
      }
      args.push(config.executable, inputPath, '--output', outputPath)
      if (config.model) {
        args.push('--model', config.model)
      }
      return args
    }

    const args: string[] = []
    if (config.script) {
      args.push(config.script)
    }
    args.push(inputPath, '--output', outputPath)
    if (config.model) {
      args.push('--model', config.model)
    }
    return args
  }

  private async handleTiberiusOutput(
    jobId: string,
    outputPath: string,
    params: {
      assembly: string
      refSeqId: string
      start: number
      user: DecodedJWT
    },
    jobDir: string,
  ) {
    const { readFileSync } = await import('node:fs')
    const gtfText = readFileSync(outputPath, 'utf8')
    const features = parseGtf(gtfText, params.refSeqId, params.start)

    const job = this.jobs.get(jobId)!
    if (features.length === 0) {
      job.status = 'completed'
      job.message = 'No genes predicted in this region'
      job.featureIds = []
      this.cleanupJobDir(jobDir)
      return
    }

    const featureIds: string[] = []
    for (const feature of features) {
      const change = new AddFeatureChange({
        typeName: 'AddFeatureChange',
        changedIds: [feature._id],
        assembly: params.assembly,
        addedFeature: feature,
      })
      await this.changesService.create(change, params.user)
      featureIds.push(feature._id)
    }

    job.status = 'completed'
    job.message = `Predicted ${features.length} gene(s)`
    job.featureIds = featureIds
    this.logger.log(
      `Tiberius job ${jobId} completed: ${features.length} genes imported`,
    )
    this.cleanupJobDir(jobDir)
  }

  private cleanupJobDir(jobDir: string) {
    try {
      rmSync(jobDir, { recursive: true, force: true })
    } catch (error) {
      this.logger.warn(`Failed to clean up job dir ${jobDir}: ${error}`)
    }
  }
}
