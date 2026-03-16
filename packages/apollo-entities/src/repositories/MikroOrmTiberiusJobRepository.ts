import type {
  TiberiusJobRepository,
  TiberiusJobRow,
} from '@apollo-annotation/common'
import type { EntityManager, InferEntity } from '@mikro-orm/core'

import { TiberiusJobEntity } from '../entities/TiberiusJobEntity.js'

function toRow(entity: InferEntity<typeof TiberiusJobEntity>): TiberiusJobRow {
  return {
    _id: entity._id,
    status: entity.status,
    assemblyId: entity.assemblyId,
    refSeqId: entity.refSeqId,
    refSeqName: entity.refSeqName,
    start: entity.start,
    end: entity.end,
    modelCfg: entity.modelCfg ?? undefined,
    useSingularity: entity.useSingularity,
    trackConfigId: entity.trackConfigId ?? undefined,
    error: entity.error ?? undefined,
    createdBy: entity.createdBy ?? undefined,
    createdAt: entity.createdAt,
    startedAt: entity.startedAt ?? undefined,
  }
}

export class MikroOrmTiberiusJobRepository implements TiberiusJobRepository {
  constructor(private readonly em: EntityManager) {}

  async findById(id: string) {
    const entity = await this.em.findOne(TiberiusJobEntity, { _id: id })
    if (entity) {
      return toRow(entity)
    }
    return
  }

  async findByAssemblyId(assemblyId: string) {
    const entities = await this.em.find(
      TiberiusJobEntity,
      { assemblyId },
      { orderBy: { createdAt: 'DESC' }, limit: 50 },
    )
    return entities.map((e) => toRow(e))
  }

  async findByUser(userId: string) {
    const entities = await this.em.find(
      TiberiusJobEntity,
      { createdBy: userId },
      { orderBy: { createdAt: 'DESC' }, limit: 50 },
    )
    return entities.map((e) => toRow(e))
  }

  async create(row: TiberiusJobRow) {
    const entity = this.em.create(TiberiusJobEntity, {
      _id: row._id,
      status: row.status,
      assemblyId: row.assemblyId,
      refSeqId: row.refSeqId,
      refSeqName: row.refSeqName,
      start: row.start,
      end: row.end,
      modelCfg: row.modelCfg,
      useSingularity: row.useSingularity,
      trackConfigId: row.trackConfigId,
      error: row.error,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      startedAt: row.startedAt,
    })
    this.em.persist(entity)
    await this.em.flush()
    return toRow(entity)
  }

  async updateById(id: string, data: Partial<Omit<TiberiusJobRow, '_id'>>) {
    const entity = await this.em.findOne(TiberiusJobEntity, { _id: id })
    if (!entity) {
      return
    }
    if (data.status !== undefined) {
      entity.status = data.status
    }
    if (data.trackConfigId !== undefined) {
      entity.trackConfigId = data.trackConfigId
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
      TiberiusJobEntity,
      { status: 'pending' },
      { orderBy: { createdAt: 'ASC' }, limit },
    )
    return entities.map((e) => toRow(e))
  }

  async countByStatus(status: string) {
    return this.em.count(TiberiusJobEntity, { status })
  }

  async findRunningOlderThan(cutoff: Date) {
    // eslint-disable-next-line unicorn/no-array-method-this-argument
    const entities = await this.em.find(TiberiusJobEntity, {
      status: 'running',
      startedAt: { $lt: cutoff },
    })
    return entities.map((e) => toRow(e))
  }

  async deleteOlderThan(cutoff: Date, statuses: string[]) {
    // eslint-disable-next-line unicorn/no-array-method-this-argument
    const entities = await this.em.find(TiberiusJobEntity, {
      status: { $in: statuses },
      createdAt: { $lt: cutoff },
    })
    const rows = entities.map((e) => toRow(e))
    for (const entity of entities) {
      this.em.remove(entity)
    }
    await this.em.flush()
    return rows
  }

  async resetOrphanedRunning() {
    // eslint-disable-next-line unicorn/no-array-method-this-argument
    const entities = await this.em.find(TiberiusJobEntity, {
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
