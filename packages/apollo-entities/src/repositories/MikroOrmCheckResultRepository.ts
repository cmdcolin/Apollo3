import type {
  CheckResultRepository,
  CheckResultRow,
} from '@apollo-annotation/common'
import type { EntityManager, InferEntity } from '@mikro-orm/core'

import { CheckResultEntity } from '../entities/CheckResultEntity.js'

function toRow(entity: InferEntity<typeof CheckResultEntity>): CheckResultRow {
  return {
    _id: entity._id,
    name: entity.name,
    cause: entity.cause ?? undefined,
    featureId: entity.featureId,
    assembly:
      typeof entity.assembly === 'string'
        ? entity.assembly
        : entity.assembly._id,
    refSeq: entity.refSeq,
    start: entity.start,
    end: entity.end,
    ignored: entity.ignored,
    message: entity.message ?? undefined,
  }
}

export class MikroOrmCheckResultRepository implements CheckResultRepository {
  constructor(private readonly em: EntityManager) {}

  async findByRange(
    assemblyId: string,
    refSeq: string,
    start: number,
    end: number,
  ) {
    const entities = await this.em.find(
      CheckResultEntity,
      {
        assembly: assemblyId,
        refSeq,
        start: { $lte: end },
        end: { $gte: start },
      },
      {},
    )
    return entities.map((x) => toRow(x))
  }

  async create(row: CheckResultRow) {
    const entity = this.em.create(CheckResultEntity, {
      _id: row._id,
      name: row.name,
      cause: row.cause,
      featureId: row.featureId,
      assembly: row.assembly,
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
      assembly: row.assembly,
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
    const entities = await this.em.find(CheckResultEntity, { featureId }, {})
    return entities.map((x) => toRow(x))
  }

  async findByFeatureIds(featureIds: string[]) {
    if (featureIds.length === 0) {
      return []
    }
    const entities = await this.em.find(
      CheckResultEntity,
      { featureId: { $in: featureIds } },
      {},
    )
    return entities.map((x) => toRow(x))
  }

  async findByAssembly(assemblyId: string) {
    const entities = await this.em.find(
      CheckResultEntity,
      { assembly: assemblyId },
      {},
    )
    return entities.map((x) => toRow(x))
  }

  async deleteByIds(ids: string[]) {
    return this.em.nativeDelete(CheckResultEntity, { _id: { $in: ids } })
  }

  async deleteByAssembly(assemblyId: string) {
    return this.em.nativeDelete(CheckResultEntity, { assembly: assemblyId })
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
