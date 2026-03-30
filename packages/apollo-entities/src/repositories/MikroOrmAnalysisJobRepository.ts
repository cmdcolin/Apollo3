import type {
  AnalysisJobRepository,
  AnalysisJobRow,
} from '@apollo-annotation/common'
import type { EntityManager, InferEntity } from '@mikro-orm/core'

import { AnalysisJobEntity } from '../entities/AnalysisJobEntity.js'

function toRow(entity: InferEntity<typeof AnalysisJobEntity>): AnalysisJobRow {
  return {
    _id: entity._id,
    status: entity.status,
    tool: entity.tool,
    assemblyName: entity.assemblyName ?? undefined,
    params: entity.params,
    results: entity.results ?? undefined,
    metadata: entity.metadata ?? undefined,
    error: entity.error ?? undefined,
    createdBy: entity.createdBy ?? undefined,
    createdAt: entity.createdAt,
    startedAt: entity.startedAt ?? undefined,
  }
}

export class MikroOrmAnalysisJobRepository implements AnalysisJobRepository {
  constructor(private readonly em: EntityManager) {}

  async findById(id: string) {
    const entity = await this.em.findOne(AnalysisJobEntity, { _id: id })
    if (entity) {
      return toRow(entity)
    }
    return
  }

  async findByUser(userId: string) {
    const entities = await this.em.find(
      AnalysisJobEntity,
      { createdBy: userId },
      { orderBy: { createdAt: 'DESC' }, limit: 50 },
    )
    return entities.map((e) => toRow(e))
  }

  async create(row: AnalysisJobRow) {
    const entity = this.em.create(AnalysisJobEntity, {
      _id: row._id,
      status: row.status,
      tool: row.tool,
      assemblyName: row.assemblyName,
      params: row.params,
      results: row.results,
      metadata: row.metadata,
      error: row.error,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      startedAt: row.startedAt,
    })
    this.em.persist(entity)
    await this.em.flush()
    return toRow(entity)
  }

  async updateById(id: string, data: Partial<Omit<AnalysisJobRow, '_id'>>) {
    const entity = await this.em.findOne(AnalysisJobEntity, { _id: id })
    if (!entity) {
      return
    }
    if (data.status !== undefined) {
      entity.status = data.status
    }
    if (data.results !== undefined) {
      entity.results = data.results
    }
    if (data.metadata !== undefined) {
      entity.metadata = data.metadata
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
      AnalysisJobEntity,
      { status: 'pending' },
      { orderBy: { createdAt: 'ASC' }, limit },
    )
    return entities.map((e) => toRow(e))
  }

  async countByStatus(status: string) {
    return this.em.count(AnalysisJobEntity, { status })
  }

  async findRunningOlderThan(cutoff: Date) {
    const entities = await this.em.find(AnalysisJobEntity, {
      status: 'running',
      startedAt: { $lt: cutoff },
    })
    return entities.map((e) => toRow(e))
  }

  async deleteCompletedOlderThan(cutoff: Date) {
    const entities = await this.em.find(AnalysisJobEntity, {
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
    const entities = await this.em.find(AnalysisJobEntity, {
      status: 'running',
    })
    for (const entity of entities) {
      entity.status = 'pending'
      entity.startedAt = null
    }
    await this.em.flush()
    return entities.length
  }
}
