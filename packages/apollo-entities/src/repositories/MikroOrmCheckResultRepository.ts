import type {
  CheckResultRepository,
  CheckResultRow,
} from '@apollo-annotation/common'
import { type EntityManager, type InferEntity } from '@mikro-orm/core'

import { CheckResultEntity } from '../entities/CheckResultEntity.js'

function toRow(entity: InferEntity<typeof CheckResultEntity>): CheckResultRow {
  return {
    _id: entity._id,
    name: entity.name,
    cause: entity.cause ?? undefined,
    featureId: entity.featureId,
    refSeq:
      typeof entity.refSeq === 'string' ? entity.refSeq : entity.refSeq._id,
    start: entity.start,
    end: entity.end,
    ignored: entity.ignored,
    message: entity.message ?? undefined,
  }
}

export class MikroOrmCheckResultRepository implements CheckResultRepository {
  constructor(private readonly em: EntityManager) {}

  async findByRange(refSeqId: string, start: number, end: number) {
    const entities = await this.em.find(CheckResultEntity, {
      refSeq: refSeqId,
      start: { $lte: end },
      end: { $gte: start },
    })
    return entities.map(toRow)
  }

  async create(row: CheckResultRow) {
    const entity = this.em.create(CheckResultEntity, {
      _id: row._id,
      name: row.name,
      cause: row.cause,
      featureId: row.featureId,
      refSeq: row.refSeq,
      start: row.start,
      end: row.end,
      ignored: row.ignored,
      message: row.message,
    })
    this.em.persist(entity)
    await this.em.flush()
    return toRow(entity)
  }

  async createMany(rows: CheckResultRow[]) {
    if (rows.length === 0) {
      return []
    }
    const data = rows.map((row) => ({
      _id: row._id,
      name: row.name,
      cause: row.cause ?? null,
      featureId: row.featureId,
      refSeq: row.refSeq,
      start: row.start,
      end: row.end,
      ignored: row.ignored,
      message: row.message ?? null,
    }))
    await this.em.insertMany(CheckResultEntity, data)
    return rows
  }

  async findByFeatureId(featureId: string) {
    const entities = await this.em.find(CheckResultEntity, { featureId })
    return entities.map(toRow)
  }

  async findByRefSeqIds(refSeqIds: string[]) {
    const filter = refSeqIds.length > 0 ? { refSeq: { $in: refSeqIds } } : {}
    const entities = await this.em.find(CheckResultEntity, filter)
    return entities.map(toRow)
  }

  async deleteByIds(ids: string[]) {
    return this.em.nativeDelete(CheckResultEntity, { _id: { $in: ids } })
  }

  async deleteByRefSeq(refSeqId: string) {
    return this.em.nativeDelete(CheckResultEntity, { refSeq: refSeqId })
  }

  async deleteByFeatureIdsAndName(featureIds: string[], checkName: string) {
    return this.em.nativeDelete(CheckResultEntity, {
      featureId: { $in: featureIds },
      name: checkName,
    })
  }

  async updateById(id: string, data: Partial<Omit<CheckResultRow, '_id'>>) {
    const entity = await this.em.findOne(CheckResultEntity, { _id: id })
    if (!entity) {
      return
    }
    this.em.assign(entity, data)
    await this.em.flush()
    return toRow(entity)
  }
}
