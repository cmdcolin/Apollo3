import type {
  RefSeqChunkRepository,
  RefSeqChunkRow,
} from '@apollo-annotation/common'
import type { EntityManager, InferEntity } from '@mikro-orm/core'

import { RefSeqChunkEntity } from '../entities/RefSeqChunkEntity.js'

function toRow(entity: InferEntity<typeof RefSeqChunkEntity>): RefSeqChunkRow {
  return {
    _id: entity._id,
    refSeq:
      typeof entity.refSeq === 'string' ? entity.refSeq : entity.refSeq._id,
    n: entity.n,
    sequence: entity.sequence,
    user: entity.user ?? undefined,
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

  async findByRefSeqAndRange(refSeqId: string, startN: number, endN: number) {
    const entities = await this.em.find(
      RefSeqChunkEntity,
      { refSeq: refSeqId, n: { $gte: startN, $lte: endN } },
      { orderBy: { n: 'asc' } },
    )
    return entities.map(toRow)
  }

  async create(row: RefSeqChunkRow) {
    const entity = this.em.create(RefSeqChunkEntity, {
      _id: row._id,
      refSeq: row.refSeq,
      n: row.n,
      sequence: row.sequence,
      user: row.user,
    })
    this.em.persist(entity)
    await this.em.flush()
    return toRow(entity)
  }

  async deleteByRefSeqs(refSeqIds: string[]) {
    return this.em.nativeDelete(RefSeqChunkEntity, {
      refSeq: { $in: refSeqIds },
    })
  }

  async createMany(rows: RefSeqChunkRow[]) {
    if (rows.length === 0) {
      return []
    }
    const data = rows.map((row) => ({
      _id: row._id,
      refSeq: row.refSeq,
      n: row.n,
      sequence: row.sequence,
      user: row.user ?? null,
    }))
    await this.em.insertMany(RefSeqChunkEntity, data)
    return rows
  }
}
