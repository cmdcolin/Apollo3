import { randomBytes } from 'node:crypto'

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common'

import { ToolsConfigService } from '../config/tools-config.service.js'
import { DatabaseService } from '../mikro-orm/database.service.js'

@Injectable()
export class ToolsService {
  constructor(
    @Inject(ToolsConfigService)
    private readonly toolsConfig: ToolsConfigService,
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  private readonly logger = new Logger(ToolsService.name)

  getTiberiusAvailability() {
    const config = this.toolsConfig.getTiberiusConfig()
    return {
      available: config.enabled,
      useSingularity: config.useSingularity,
      maxRegionSize: config.maxRegionSize,
      modelCfg: config.modelCfg,
      availableModels: this.toolsConfig.listTiberiusModelConfigs(),
    }
  }

  async submitJob(params: {
    assemblyId: string
    refSeqId: string
    refSeqName: string
    start: number
    end: number
    modelCfg?: string
    useSingularity?: boolean
    createdBy?: string
  }) {
    const config = this.toolsConfig.getToolConfig('tiberius')
    if (!config?.enabled) {
      throw new BadRequestException('Tiberius is not available')
    }

    const regionSize = params.end - params.start
    if (regionSize > config.maxRegionSize) {
      throw new BadRequestException(
        `Region size ${regionSize} exceeds maximum ${config.maxRegionSize}`,
      )
    }

    const _id = randomBytes(16).toString('hex')
    const job = await this.db.tiberiusJob.create({
      _id,
      status: 'pending',
      assemblyId: params.assemblyId,
      refSeqId: params.refSeqId,
      refSeqName: params.refSeqName,
      start: params.start,
      end: params.end,
      modelCfg: params.modelCfg,
      useSingularity: params.useSingularity ?? false,
      createdBy: params.createdBy,
      createdAt: new Date(),
    })

    this.logger.log(
      `Tiberius job ${_id} created: ${params.refSeqName}:${params.start}-${params.end}`,
    )
    return job
  }

  async getJob(id: string) {
    return this.db.tiberiusJob.findById(id)
  }

  async getJobsByUser(userId: string) {
    return this.db.tiberiusJob.findByUser(userId)
  }

  async cancelJob(id: string) {
    const job = await this.db.tiberiusJob.findById(id)
    if (!job) {
      return false
    }
    if (job.status === 'ready' || job.status === 'failed') {
      return false
    }
    await this.db.tiberiusJob.updateById(id, {
      status: 'cancelled',
      error: 'Cancelled by user',
    })
    this.logger.log(`Tiberius job ${id} cancelled`)
    return true
  }
}
