import type {
  RefSeqChunkRepository,
  RefSeqChunkRow,
} from '@apollo-annotation/common'
import { EntityManager } from '@mikro-orm/core'

import { RefSeqChunkEntity } from '../entities/RefSeqChunkEntity'

function toRow(entity: RefSeqChunkEntity): RefSeqChunkRow {
  return {
    _id: entity._id,
    refSeq:
      typeof entity.refSeq === 'string' ? entity.refSeq : entity.refSeq._id,
    n: entity.n,
    sequence: entity.sequence,
    status: entity.status,
    user: entity.user,
  }
}

export class MikroOrmRefSeqChunkRepository implements RefSeqChunkRepository {
  constructor(private readonly em: EntityManager) {}

  async findByRefSeq(refSeqId: string) {
    const entities = await this.em.find(RefSeqChunkEntity, {
      refSeq: refSeqId,
    })
    return entities.map(toRow)
  }

  async create(row: RefSeqChunkRow) {
    const entity = this.em.create(RefSeqChunkEntity, {
      _id: row._id,
      refSeq: row.refSeq,
      n: row.n,
      sequence: row.sequence,
      status: row.status,
      user: row.user,
    })
    await this.em.persistAndFlush(entity)
    return toRow(entity)
  }
}
