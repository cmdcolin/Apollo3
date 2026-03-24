import { type ChildProcess, execSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

import {
  Inject,
  Injectable,
  Logger,
  type OnModuleInit,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { SequenceService } from '../../sequence/sequence.service.js'
import { rewriteGtfCoordinates } from '../gtf-rewriter.js'
import type { AnalysisRunner, RunContext } from '../runner.js'

interface TiberiusConfig {
  enabled: boolean
  tiberiusPath: string
  modelCfg?: string
  useSingularity: boolean
  maxRegionSize: number
  timeout: number
}

const DEFAULT_CONFIG: TiberiusConfig = {
  enabled: false,
  tiberiusPath: '',
  useSingularity: false,
  maxRegionSize: 10_000_000,
  timeout: 3_600_000,
}

const PROBE_PATHS = [
  '~/src/Tiberius/tiberius.py',
  '~/Tiberius/tiberius.py',
  '/opt/Tiberius/tiberius.py',
]

@Injectable()
export class TiberiusRunner implements AnalysisRunner, OnModuleInit {
  readonly tool = 'tiberius'

  constructor(
    @Inject(SequenceService)
    private readonly sequenceService: SequenceService,
    @Inject(ConfigService)
    private readonly configService: ConfigService<{
      FILE_UPLOAD_FOLDER: string
      URL: string
      APOLLO_TOOLS_CONFIG: string
      TIBERIUS_PATH: string
      TIBERIUS_MODEL_CFG: string
    }>,
  ) {}

  private readonly logger = new Logger(TiberiusRunner.name)
  private config: TiberiusConfig = { ...DEFAULT_CONFIG }

  onModuleInit() {
    this.loadConfigFile()
    this.autoDetect()
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async isInstalled() {
    return this.config.enabled
  }

  getConfig() {
    return {
      maxRegionSize: this.config.maxRegionSize,
      modelCfg: this.config.modelCfg,
      availableModels: this.listModelConfigs(),
    }
  }

  async run(context: RunContext) {
    if (!this.config.enabled) {
      throw new Error('Tiberius is not available')
    }

    const { params } = context.job
    const refSeqId =
      typeof params.refSeqId === 'string' ? params.refSeqId : ''
    const refSeqName =
      typeof params.refSeqName === 'string' ? params.refSeqName : ''
    const start = Number(params.start ?? 0)
    const end = Number(params.end ?? 0)
    const modelCfg =
      typeof params.modelCfg === 'string'
        ? params.modelCfg
        : this.config.modelCfg
    const useSingularity = this.config.useSingularity
    const assemblyId = context.job.assemblyId ?? ''

    const regionSize = end - start
    if (regionSize > this.config.maxRegionSize) {
      throw new Error(
        `Region size ${regionSize} exceeds maximum ${this.config.maxRegionSize}`,
      )
    }

    const sequence = await this.sequenceService.getSequence({
      refSeq: refSeqId,
      start,
      end,
    })

    // FILE_UPLOAD_FOLDER is required by Joi validation
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const fileUploadFolder = this.configService.get('FILE_UPLOAD_FOLDER', {
      infer: true,
    })!
    const jobDir = path.join(
      fileUploadFolder,
      'analysis-jobs',
      context.job._id,
    )
    mkdirSync(jobDir, { recursive: true })

    const inputPath = path.join(jobDir, 'input.fasta')
    const outputPath = path.join(jobDir, 'output.gtf')
    const fastaContent = `>${refSeqName}:${start}-${end}\n${sequence}\n`
    writeFileSync(inputPath, fastaContent)

    const { executable, args } = this.buildCommand(
      {
        tiberiusPath: this.config.tiberiusPath,
        modelCfg,
        useSingularity,
      },
      inputPath,
      outputPath,
    )

    this.logger.log(
      `Starting Tiberius for job ${context.job._id}: ${executable} ${args.join(' ')}`,
    )

    await this.spawnAndWait(executable, args, jobDir, context.signal)

    if (!existsSync(outputPath)) {
      throw new Error('Tiberius did not produce output')
    }

    const rawGtf = readFileSync(outputPath, 'utf8')
    const rewrittenGtf = rewriteGtfCoordinates(rawGtf, refSeqName, start)
    const finalGtfPath = path.join(jobDir, 'predictions.gtf')
    writeFileSync(finalGtfPath, rewrittenGtf)

    // URL is required by Joi validation
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
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

    if (existsSync(inputPath)) {
      rmSync(inputPath)
    }
    if (existsSync(outputPath)) {
      rmSync(outputPath)
    }

    return { trackConfigId }
  }

  // ── Config detection ─────────────────────────────────────────────

  private loadConfigFile() {
    const configPath =
      this.configService.get('APOLLO_TOOLS_CONFIG', { infer: true }) ??
      'apollo-tools.json'
    if (!existsSync(configPath)) {
      return
    }
    const raw = readFileSync(configPath, 'utf8')
    const parsed = JSON.parse(raw) as
      | { tools?: { tiberius?: Partial<TiberiusConfig> } }
      | undefined
    if (parsed?.tools?.tiberius) {
      this.config = { ...DEFAULT_CONFIG, ...parsed.tools.tiberius }
      this.logger.log(`Loaded Tiberius config from ${configPath}`)
    }
  }

  private autoDetect() {
    const envPath = this.configService.get('TIBERIUS_PATH', { infer: true })
    if (envPath) {
      const resolved = this.expandHome(envPath)
      if (existsSync(resolved)) {
        this.config = { ...this.config, enabled: true, tiberiusPath: resolved }
        this.logger.log(`Tiberius configured from TIBERIUS_PATH: ${resolved}`)
        this.applyEnvModelCfg()
        return
      }
      this.logger.warn(`TIBERIUS_PATH set but not found: ${resolved}`)
    }

    if (this.config.enabled) {
      this.applyEnvModelCfg()
      return
    }

    const onPath = this.whichPath('tiberius.py')
    if (onPath) {
      this.config = { ...this.config, enabled: true, tiberiusPath: onPath }
      this.logger.log(`Auto-detected tiberius.py on PATH: ${onPath}`)
      this.applyEnvModelCfg()
      return
    }

    for (const probePath of PROBE_PATHS) {
      const resolved = this.expandHome(probePath)
      if (existsSync(resolved)) {
        this.config = {
          ...this.config,
          enabled: true,
          tiberiusPath: resolved,
        }
        this.logger.log(`Auto-detected Tiberius at ${resolved}`)
        this.applyEnvModelCfg()
        return
      }
    }

    this.logger.log(
      'Tiberius not found. Set TIBERIUS_PATH or install tiberius.py on PATH.',
    )
  }

  private applyEnvModelCfg() {
    const envModelCfg = this.configService.get('TIBERIUS_MODEL_CFG', {
      infer: true,
    })
    if (envModelCfg && !this.config.modelCfg) {
      this.config.modelCfg = envModelCfg
      this.logger.log(`Tiberius model config from env: ${envModelCfg}`)
    }
  }

  private listModelConfigs() {
    if (!this.config.enabled || !this.config.tiberiusPath) {
      return []
    }
    const tiberiusDir = path.dirname(this.config.tiberiusPath)
    const modelCfgDir = path.resolve(tiberiusDir, 'model_cfg')
    if (!existsSync(modelCfgDir)) {
      return []
    }
    return readdirSync(modelCfgDir)
      .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
      .map((f) => f.replace(/\.(yaml|yml)$/, ''))
      .sort()
  }

  private expandHome(p: string) {
    if (p.startsWith('~/')) {
      return path.resolve(homedir(), p.slice(2))
    }
    return path.resolve(p)
  }

  private whichPath(binary: string) {
    try {
      return execSync(`which ${binary}`, { stdio: 'pipe' }).toString().trim()
    } catch {
      return
    }
  }

  // ── Process management ───────────────────────────────────────────

  private spawnAndWait(
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
        reject(error instanceof Error ? error : new Error(String(error)))
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
