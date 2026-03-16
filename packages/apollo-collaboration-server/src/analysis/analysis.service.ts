import { randomBytes } from 'node:crypto'

import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common'

import { DatabaseService } from '../mikro-orm/database.service.js'

import type { AnalysisRunner } from './runner.js'
import { BlatRunner } from './runners/blat.runner.js'
import { LocalBlastRunner } from './runners/local-blast.runner.js'
import { MiniprotRunner } from './runners/miniprot.runner.js'
import { NcbiBlastRunner } from './runners/ncbi-blast.runner.js'

@Injectable()
export class AnalysisService {
  private readonly runners = new Map<string, AnalysisRunner>()

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(LocalBlastRunner) localBlast: LocalBlastRunner,
    @Inject(NcbiBlastRunner) ncbiBlast: NcbiBlastRunner,
    @Inject(BlatRunner) blat: BlatRunner,
    @Inject(MiniprotRunner) miniprot: MiniprotRunner,
  ) {
    this.runners.set(localBlast.tool, localBlast)
    this.runners.set(ncbiBlast.tool, ncbiBlast)
    this.runners.set(blat.tool, blat)
    this.runners.set(miniprot.tool, miniprot)
  }

  private readonly logger = new Logger(AnalysisService.name)

  async getTools() {
    const results: {
      tool: string
      installed: boolean
      canBuildDb: boolean
    }[] = []
    for (const [tool, runner] of this.runners) {
      const installed = await runner.isInstalled()
      results.push({
        tool,
        installed,
        canBuildDb: typeof runner.buildDb === 'function',
      })
    }
    return results
  }

  // ── Databases ───────────────────────────────────────────────────────

  async getDatabases(assemblyId?: string) {
    if (assemblyId) {
      return this.db.analysisDb.findByAssemblyId(assemblyId)
    }
    return this.db.analysisDb.findAll()
  }

  async getDatabase(id: string) {
    return this.db.analysisDb.findById(id)
  }

  async createDatabase(params: {
    name: string
    tool: string
    params: Record<string, unknown>
    assemblyIds: string[]
    createdBy?: string
  }) {
    const _id = randomBytes(16).toString('hex')
    return this.db.analysisDb.create({
      _id,
      name: params.name,
      tool: params.tool,
      status: 'ready',
      params: params.params,
      assemblyIds: params.assemblyIds,
      createdBy: params.createdBy,
    })
  }

  async buildDatabase(params: {
    assemblyId: string
    tool: string
    name: string
    params: Record<string, unknown>
    createdBy?: string
  }) {
    const runner = this.runners.get(params.tool)
    if (!runner?.buildDb) {
      throw new BadRequestException(
        `Tool "${params.tool}" does not support building databases`,
      )
    }

    const assembly = await this.db.assembly.findById(params.assemblyId)
    if (!assembly) {
      throw new BadRequestException(`Assembly "${params.assemblyId}" not found`)
    }

    const dbName = `${assembly.name}-${params.tool}-${randomBytes(4).toString('hex')}`
    const _id = randomBytes(16).toString('hex')
    const row = await this.db.analysisDb.create({
      _id,
      name: params.name,
      tool: params.tool,
      status: 'building',
      params: params.params,
      assemblyIds: [params.assemblyId],
      createdBy: params.createdBy,
    })

    void this.buildDbAsync(
      _id,
      runner.buildDb.bind(runner),
      params.assemblyId,
      dbName,
      params.params,
    )

    return row
  }

  private async buildDbAsync(
    dbId: string,
    buildDb: NonNullable<AnalysisRunner['buildDb']>,
    assemblyId: string,
    dbName: string,
    params: Record<string, unknown>,
  ) {
    try {
      const { dbPath } = await buildDb({
        assemblyId,
        dbName,
        params,
        db: this.db,
      })
      await this.db.analysisDb.updateById(dbId, { dbPath, status: 'ready' })
      this.logger.log(`Analysis DB ${dbId} built at ${dbPath}`)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      this.logger.error(`Failed to build analysis DB ${dbId}: ${msg}`)
      await this.db.analysisDb.updateById(dbId, { status: 'error' })
    }
  }

  async deleteDatabase(id: string) {
    return this.db.analysisDb.deleteById(id)
  }

  // ── Jobs ────────────────────────────────────────────────────────────

  async submitJob(jobParams: {
    tool: string
    assemblyId?: string
    params: Record<string, unknown>
    createdBy?: string
  }) {
    if (!this.runners.has(jobParams.tool)) {
      throw new BadRequestException(`Unknown tool: ${jobParams.tool}`)
    }

    const _id = randomBytes(16).toString('hex')
    const job = await this.db.analysisJob.create({
      _id,
      status: 'pending',
      tool: jobParams.tool,
      assemblyId: jobParams.assemblyId,
      params: jobParams.params,
      createdBy: jobParams.createdBy,
      createdAt: new Date(),
    })

    this.logger.log(`${jobParams.tool} job ${_id} created`)
    return job
  }

  async getJob(id: string) {
    return this.db.analysisJob.findById(id)
  }

  async getJobsByUser(userId: string) {
    return this.db.analysisJob.findByUser(userId)
  }

  async cancelJob(id: string) {
    const job = await this.db.analysisJob.findById(id)
    if (!job) {
      return false
    }
    if (job.status === 'ready' || job.status === 'failed') {
      return false
    }
    await this.db.analysisJob.updateById(id, {
      status: 'cancelled',
      error: 'Cancelled by user',
    })
    this.logger.log(`Analysis job ${id} cancelled`)
    return true
  }
}
