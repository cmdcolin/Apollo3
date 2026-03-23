import { type ChildProcess, spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'

import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { ToolsConfigService } from '../../config/tools-config.service.js'
import { SequenceService } from '../../sequence/sequence.service.js'
import { rewriteGtfCoordinates } from '../gtf-rewriter.js'
import type { AnalysisRunner, RunContext } from '../runner.js'

@Injectable()
export class TiberiusRunner implements AnalysisRunner {
  readonly tool = 'tiberius'

  constructor(
    @Inject(ToolsConfigService)
    private readonly toolsConfig: ToolsConfigService,
    @Inject(SequenceService)
    private readonly sequenceService: SequenceService,
    @Inject(ConfigService)
    private readonly configService: ConfigService<{
      FILE_UPLOAD_FOLDER: string
      URL: string
    }>,
  ) {}

  private readonly logger = new Logger(TiberiusRunner.name)

  async isInstalled() {
    return this.toolsConfig.getTiberiusConfig().enabled
  }

  getConfig() {
    const config = this.toolsConfig.getTiberiusConfig()
    return {
      useSingularity: config.useSingularity,
      maxRegionSize: config.maxRegionSize,
      modelCfg: config.modelCfg,
      availableModels: this.toolsConfig.listTiberiusModelConfigs(),
    }
  }

  async run(context: RunContext) {
    const config = this.toolsConfig.getTiberiusConfig()
    if (!config.enabled) {
      throw new Error('Tiberius is not available')
    }

    const { params } = context.job
    const refSeqId = String(params.refSeqId ?? '')
    const refSeqName = String(params.refSeqName ?? '')
    const start = Number(params.start ?? 0)
    const end = Number(params.end ?? 0)
    const modelCfg = params.modelCfg ? String(params.modelCfg) : config.modelCfg
    const useSingularity = Boolean(params.useSingularity ?? config.useSingularity)
    const assemblyId = context.job.assemblyId ?? ''

    const regionSize = end - start
    if (regionSize > config.maxRegionSize) {
      throw new Error(
        `Region size ${regionSize} exceeds maximum ${config.maxRegionSize}`,
      )
    }

    const sequence = await this.sequenceService.getSequence({
      refSeq: refSeqId,
      start,
      end,
    })

    const fileUploadFolder = this.configService.get('FILE_UPLOAD_FOLDER', {
      infer: true,
    })!
    const jobDir = join(fileUploadFolder, 'analysis-jobs', context.job._id)
    mkdirSync(jobDir, { recursive: true })

    const inputPath = join(jobDir, 'input.fasta')
    const outputPath = join(jobDir, 'output.gtf')
    const fastaContent = `>${refSeqName}:${start}-${end}\n${sequence}\n`
    writeFileSync(inputPath, fastaContent)

    const { executable, args } = this.buildCommand(
      {
        tiberiusPath: config.tiberiusPath,
        modelCfg,
        useSingularity,
      },
      inputPath,
      outputPath,
    )

    this.logger.log(
      `Starting Tiberius for job ${context.job._id}: ${executable} ${args.join(' ')}`,
    )

    await this.spawnAndWait(context.job._id, executable, args, jobDir, context.signal)

    if (!existsSync(outputPath)) {
      throw new Error('Tiberius did not produce output')
    }

    const rawGtf = readFileSync(outputPath, 'utf8')
    const rewrittenGtf = rewriteGtfCoordinates(rawGtf, refSeqName, start)
    const finalGtfPath = join(jobDir, 'predictions.gtf')
    writeFileSync(finalGtfPath, rewrittenGtf)

    const serverUrl = this.configService.get('URL', { infer: true })!
    const trackId = `tiberius_${context.job._id}`
    const trackConfigId = randomBytes(12).toString('hex')

    await context.db.trackConfig.create({
      _id: trackConfigId,
      trackId,
      assemblyIds: [assemblyId],
      config: {
        type: 'FeatureTrack',
        trackId,
        name: `Tiberius: ${refSeqName}:${start.toLocaleString()}-${end.toLocaleString()}`,
        category: ['Gene Predictions'],
        assemblyNames: [assemblyId],
        adapter: {
          type: 'GtfAdapter',
          gtfLocation: {
            uri: `${serverUrl}/analysis/jobs/${context.job._id}/files/predictions.gtf`,
            locationType: 'UriLocation',
          },
        },
      },
      createdBy: context.job.createdBy,
    })

    this.logger.log(
      `Tiberius job ${context.job._id} completed, track ${trackId} created`,
    )

    // Clean up intermediate files, keep predictions.gtf
    if (existsSync(inputPath)) {
      rmSync(inputPath)
    }
    if (existsSync(outputPath)) {
      rmSync(outputPath)
    }

    return { trackConfigId }
  }

  private spawnAndWait(
    jobId: string,
    executable: string,
    args: string[],
    cwd: string,
    signal: AbortSignal,
  ) {
    return new Promise<void>((resolve, reject) => {
      let child: ChildProcess
      try {
        child = spawn(executable, args, {
          cwd,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      } catch (error) {
        reject(error)
        return
      }

      let stderr = ''
      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      const onAbort = () => {
        if (!child.killed) {
          child.kill('SIGTERM')
        }
        reject(new Error('Job was cancelled'))
      }
      signal.addEventListener('abort', onAbort, { once: true })

      child.on('close', (code) => {
        signal.removeEventListener('abort', onAbort)
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
        signal.removeEventListener('abort', onAbort)
        reject(err)
      })
    })
  }

  private buildCommand(
    config: {
      tiberiusPath: string
      modelCfg?: string
      useSingularity: boolean
    },
    inputPath: string,
    outputPath: string,
  ) {
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
}
