import type { RefSeqRepository, RefSeqRow } from '@apollo-annotation/common'
import type { EntityManager, InferEntity } from '@mikro-orm/core'

import { RefSeqEntity } from '../entities/RefSeqEntity.js'

function toRow(entity: InferEntity<typeof RefSeqEntity>): RefSeqRow {
  return {
    _id: entity._id,
    assembly:
      typeof entity.assembly === 'string'
        ? entity.assembly
        : entity.assembly._id,
    name: entity.name,
    description: entity.description ?? undefined,
    aliases: entity.aliases ?? undefined,
    length: entity.length,
    chunkSize: entity.chunkSize,
    user: entity.user ?? undefined,
  }
}

export class MikroOrmRefSeqRepository implements RefSeqRepository {
  constructor(private readonly em: EntityManager) {}

  async findById(id: string) {
    const entity = await this.em.findOne(RefSeqEntity, { _id: id })
    if (entity) {
      return toRow(entity)
    }
    return
  }

  async findByAssembly(assemblyId: string) {
    const entities = await this.em.find(RefSeqEntity, {
      assembly: assemblyId,
    })
    return entities.map(toRow)
  }

  async findByAssemblies(assemblyIds: string[]) {
    const entities = await this.em.find(RefSeqEntity, {
      assembly: { $in: assemblyIds },
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
      user: row.user,
    })
    this.em.persist(entity)
    await this.em.flush()
    return toRow(entity)
  }

  async findByNameAndAssembly(name: string, assemblyId: string) {
    const entity = await this.em.findOne(RefSeqEntity, {
      name,
      assembly: assemblyId,
    })
    if (entity) {
      return toRow(entity)
    }
    return
  }

  async deleteByAssembly(assemblyId: string) {
    return this.em.nativeDelete(RefSeqEntity, { assembly: assemblyId })
  }

  async createMany(rows: RefSeqRow[]) {
    if (rows.length === 0) {
      return []
    }
    const data = rows.map((row) => ({
      _id: row._id,
      assembly: row.assembly,
      name: row.name,
      description: row.description ?? null,
      aliases: row.aliases ?? null,
      length: row.length,
      chunkSize: row.chunkSize,
      user: row.user ?? null,
    }))
    await this.em.insertMany(RefSeqEntity, data)
    return rows
  }

  async findAll() {
    const entities = await this.em.find(RefSeqEntity, {})
    return entities.map(toRow)
  }

  async updateById(id: string, data: Partial<Omit<RefSeqRow, '_id'>>) {
    const entity = await this.em.findOne(RefSeqEntity, { _id: id })
    if (!entity) {
      return
    }
    this.em.assign(entity, data)
    await this.em.flush()
    return toRow(entity)
  }
}
