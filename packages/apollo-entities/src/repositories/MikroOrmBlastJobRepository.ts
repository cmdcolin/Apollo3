import type {
  BlastJobRepository,
  BlastJobRow,
} from '@apollo-annotation/common'
import type { EntityManager, InferEntity } from '@mikro-orm/core'

import { BlastJobEntity } from '../entities/BlastJobEntity.js'

function toRow(entity: InferEntity<typeof BlastJobEntity>): BlastJobRow {
  return {
    _id: entity._id,
    status: entity.status,
    program: entity.program,
    database: entity.database,
    query: entity.query,
    ncbiRid: entity.ncbiRid ?? undefined,
    results: entity.results ?? undefined,
    error: entity.error ?? undefined,
    createdBy: entity.createdBy ?? undefined,
    createdAt: entity.createdAt,
    startedAt: entity.startedAt ?? undefined,
  }
}

export class MikroOrmBlastJobRepository implements BlastJobRepository {
  constructor(private readonly em: EntityManager) {}

  async findById(id: string) {
    const entity = await this.em.findOne(BlastJobEntity, { _id: id })
    if (entity) {
      return toRow(entity)
    }
    return
  }

  async findByUser(userId: string) {
    const entities = await this.em.find(
      BlastJobEntity,
      { createdBy: userId },
      { orderBy: { createdAt: 'DESC' }, limit: 50 },
    )
    return entities.map((e) => toRow(e))
  }

  async create(row: BlastJobRow) {
    const entity = this.em.create(BlastJobEntity, {
      _id: row._id,
      status: row.status,
      program: row.program,
      database: row.database,
      query: row.query,
      ncbiRid: row.ncbiRid,
      results: row.results,
      error: row.error,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      startedAt: row.startedAt,
    })
    this.em.persist(entity)
    await this.em.flush()
    return toRow(entity)
  }

  async updateById(id: string, data: Partial<Omit<BlastJobRow, '_id'>>) {
    const entity = await this.em.findOne(BlastJobEntity, { _id: id })
    if (!entity) {
      return
    }
    if (data.status !== undefined) {
      entity.status = data.status
    }
    if (data.ncbiRid !== undefined) {
      entity.ncbiRid = data.ncbiRid
    }
    if (data.results !== undefined) {
      entity.results = data.results
    }
    if (data.error !== undefined) {
      entity.error = data.error
    }
    if (data.startedAt !== undefined) {
      entity.startedAt = data.startedAt
    }
    await this.em.flush()
    return toRow(entity)
  }

  async findPending(limit: number) {
    const entities = await this.em.find(
      BlastJobEntity,
      { status: 'pending' },
      { orderBy: { createdAt: 'ASC' }, limit },
    )
    return entities.map((e) => toRow(e))
  }

  async countByStatus(status: string) {
    return this.em.count(BlastJobEntity, { status })
  }

  async findRunningOlderThan(cutoff: Date) {
    // eslint-disable-next-line unicorn/no-array-method-this-argument
    const entities = await this.em.find(BlastJobEntity, {
      status: 'running',
      startedAt: { $lt: cutoff },
    })
    return entities.map((e) => toRow(e))
  }

  async deleteCompletedOlderThan(cutoff: Date) {
    // eslint-disable-next-line unicorn/no-array-method-this-argument
    const entities = await this.em.find(BlastJobEntity, {
      status: { $in: ['ready', 'failed', 'cancelled'] },
      createdAt: { $lt: cutoff },
    })
    for (const entity of entities) {
      this.em.remove(entity)
    }
    await this.em.flush()
    return entities.length
  }

  async resetOrphanedRunning() {
    // eslint-disable-next-line unicorn/no-array-method-this-argument
    const entities = await this.em.find(BlastJobEntity, { status: 'running' })
    for (const entity of entities) {
      entity.status = 'pending'
      entity.startedAt = null
      entity.ncbiRid = null
    }
    await this.em.flush()
    return entities.length
  }
}
