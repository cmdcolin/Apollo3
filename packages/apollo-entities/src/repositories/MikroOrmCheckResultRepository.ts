import type {
  CheckResultRepository,
  CheckResultRow,
} from '@apollo-annotation/common'
import { EntityManager } from '@mikro-orm/core'

import { CheckResultEntity } from '../entities/CheckResultEntity'

function toRow(entity: CheckResultEntity): CheckResultRow {
  return {
    _id: entity._id,
    name: entity.name,
    cause: entity.cause,
    ids: entity.ids,
    refSeq:
      typeof entity.refSeq === 'string' ? entity.refSeq : entity.refSeq._id,
    start: entity.start,
    end: entity.end,
    ignored: entity.ignored,
    message: entity.message,
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
      ids: row.ids,
      refSeq: row.refSeq,
      start: row.start,
      end: row.end,
      ignored: row.ignored,
      message: row.message,
    })
    await this.em.persistAndFlush(entity)
    return toRow(entity)
  }

  async createMany(rows: CheckResultRow[]) {
    const entities: CheckResultEntity[] = []
    for (const row of rows) {
      const entity = this.em.create(CheckResultEntity, {
        _id: row._id,
        name: row.name,
        cause: row.cause,
        ids: row.ids,
        refSeq: row.refSeq,
        start: row.start,
        end: row.end,
        ignored: row.ignored,
        message: row.message,
      })
      entities.push(entity)
    }
    await this.em.persistAndFlush(entities)
    return entities.map(toRow)
  }

  async deleteByRefSeq(refSeqId: string) {
    return this.em.nativeDelete(CheckResultEntity, { refSeq: refSeqId })
  }
}
