import type { RefSeqRepository, RefSeqRow } from '@apollo-annotation/common'
import { EntityManager } from '@mikro-orm/core'

import { RefSeqEntity } from '../entities/RefSeqEntity'

function toRow(entity: RefSeqEntity): RefSeqRow {
  return {
    _id: entity._id,
    assembly:
      typeof entity.assembly === 'string'
        ? entity.assembly
        : entity.assembly._id,
    name: entity.name,
    description: entity.description,
    aliases: entity.aliases,
    length: entity.length,
    chunkSize: entity.chunkSize,
    status: entity.status,
    user: entity.user,
  }
}

export class MikroOrmRefSeqRepository implements RefSeqRepository {
  constructor(private readonly em: EntityManager) {}

  async findById(id: string) {
    const entity = await this.em.findOne(RefSeqEntity, { _id: id })
    if (entity) {
      return toRow(entity)
    }
    return undefined
  }

  async findByAssembly(assemblyId: string) {
    const entities = await this.em.find(RefSeqEntity, {
      assembly: assemblyId,
    })
    return entities.map(toRow)
  }

  async create(row: RefSeqRow) {
    const entity = this.em.create(RefSeqEntity, {
      _id: row._id,
      assembly: row.assembly,
      name: row.name,
      description: row.description,
      aliases: row.aliases,
      length: row.length,
      chunkSize: row.chunkSize,
      status: row.status,
      user: row.user,
    })
    await this.em.persistAndFlush(entity)
    return toRow(entity)
  }

  async updateById(id: string, data: Partial<Omit<RefSeqRow, '_id'>>) {
    const entity = await this.em.findOne(RefSeqEntity, { _id: id })
    if (!entity) {
      return undefined
    }
    this.em.assign(entity, data)
    await this.em.flush()
    return toRow(entity)
  }
}
