import { randomBytes } from 'node:crypto'

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common'

import { DatabaseService } from '../mikro-orm/database.service.js'

const MAX_QUERY_BYTES = 10_485_760

const VALID_PROGRAMS = new Set([
  'blastn',
  'blastp',
  'blastx',
  'tblastn',
  'tblastx',
])

@Injectable()
export class BlastService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  private readonly logger = new Logger(BlastService.name)

  // ── BLAST database configs ───────────────────────────────────────────

  async getBlastDbs(assemblyId?: string) {
    if (assemblyId) {
      return this.db.blastDb.findByAssemblyId(assemblyId)
    }
    return this.db.blastDb.findAll()
  }

  async createBlastDb(params: {
    name: string
    program: string
    database: string
    assemblyIds: string[]
    createdBy?: string
  }) {
    if (!VALID_PROGRAMS.has(params.program)) {
      throw new BadRequestException(`Invalid BLAST program: ${params.program}`)
    }
    const _id = randomBytes(16).toString('hex')
    return this.db.blastDb.create({
      _id,
      name: params.name,
      program: params.program,
      database: params.database,
      assemblyIds: params.assemblyIds,
      createdBy: params.createdBy,
    })
  }

  async deleteBlastDb(id: string) {
    return this.db.blastDb.deleteById(id)
  }

  // ── BLAST jobs ───────────────────────────────────────────────────────

  async submitJob(params: {
    program: string
    database: string
    query: string
    createdBy?: string
  }) {
    if (!VALID_PROGRAMS.has(params.program)) {
      throw new BadRequestException(`Invalid BLAST program: ${params.program}`)
    }
    if (!params.database || !params.query) {
      throw new BadRequestException('database and query are required')
    }
    if (params.query.length > MAX_QUERY_BYTES) {
      throw new BadRequestException(
        `Query too large (${params.query.length} bytes, max ${MAX_QUERY_BYTES})`,
      )
    }

    const _id = randomBytes(16).toString('hex')
    const job = await this.db.blastJob.create({
      _id,
      status: 'pending',
      program: params.program,
      database: params.database,
      query: params.query,
      createdBy: params.createdBy,
      createdAt: new Date(),
    })

    this.logger.log(
      `BLAST job ${_id} created: ${params.program} against ${params.database}`,
    )
    return job
  }

  async getJob(id: string) {
    return this.db.blastJob.findById(id)
  }

  async getJobsByUser(userId: string) {
    return this.db.blastJob.findByUser(userId)
  }

  async cancelJob(id: string) {
    const job = await this.db.blastJob.findById(id)
    if (!job) {
      return false
    }
    if (job.status === 'ready' || job.status === 'failed') {
      return false
    }
    await this.db.blastJob.updateById(id, {
      status: 'cancelled',
      error: 'Cancelled by user',
    })
    this.logger.log(`BLAST job ${id} cancelled`)
    return true
  }
}
