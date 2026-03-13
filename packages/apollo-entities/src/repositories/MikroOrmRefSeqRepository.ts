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
    status: entity.status ?? undefined,
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
    return undefined
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
      status: row.status,
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
    return undefined
  }

  async deleteByAssembly(assemblyId: string) {
    return this.em.nativeDelete(RefSeqEntity, { assembly: assemblyId })
  }

  async createMany(rows: RefSeqRow[]) {
    const entities: InferEntity<typeof RefSeqEntity>[] = []
    for (const row of rows) {
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
      entities.push(entity)
    }
    for (const entity of entities) {
      this.em.persist(entity)
    }
    await this.em.flush()
    return entities.map(toRow)
  }

  async findAll() {
    const entities = await this.em.find(RefSeqEntity, {})
    return entities.map(toRow)
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

  async activateByUser(user: string) {
    return this.em.nativeUpdate(
      RefSeqEntity,
      { status: -1, user },
      { status: 0 },
    )
  }
}
