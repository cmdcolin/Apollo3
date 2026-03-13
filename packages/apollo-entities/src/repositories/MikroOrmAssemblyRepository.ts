import type { AssemblyRepository, AssemblyRow } from '@apollo-annotation/common'
import type { EntityManager, InferEntity } from '@mikro-orm/core'

import { AssemblyEntity } from '../entities/AssemblyEntity.js'

function toRow(entity: InferEntity<typeof AssemblyEntity>): AssemblyRow {
  return {
    _id: entity._id,
    name: entity.name,
    displayName: entity.displayName ?? undefined,
    aliases: entity.aliases ?? undefined,
    description: entity.description ?? undefined,
    status: entity.status ?? undefined,
    user: entity.user ?? undefined,
    sequenceSource: entity.sequenceSource ?? undefined,
    checks: entity.checks ?? undefined,
  }
}

export class MikroOrmAssemblyRepository implements AssemblyRepository {
  constructor(private readonly em: EntityManager) {}

  async findById(id: string) {
    const entity = await this.em.findOne(AssemblyEntity, { _id: id })
    if (entity) {
      return toRow(entity)
    }
    return undefined
  }

  async findByName(name: string) {
    const entity = await this.em.findOne(AssemblyEntity, { name })
    if (entity) {
      return toRow(entity)
    }
    return undefined
  }

  async create(row: AssemblyRow) {
    const entity = this.em.create(AssemblyEntity, {
      _id: row._id,
      name: row.name,
      displayName: row.displayName,
      aliases: row.aliases,
      description: row.description,
      status: row.status,
      user: row.user,
      sequenceSource: row.sequenceSource,
      checks: row.checks,
    })
    this.em.persist(entity)
    await this.em.flush()
    return toRow(entity)
  }

  async updateById(id: string, data: Partial<Omit<AssemblyRow, '_id'>>) {
    const entity = await this.em.findOne(AssemblyEntity, { _id: id })
    if (!entity) {
      return undefined
    }
    this.em.assign(entity, data)
    await this.em.flush()
    return toRow(entity)
  }

  async findAll() {
    const entities = await this.em.find(AssemblyEntity, {})
    return entities.map(toRow)
  }

  async deleteById(id: string) {
    const entity = await this.em.findOne(AssemblyEntity, { _id: id })
    if (!entity) {
      return false
    }
    this.em.remove(entity)
    await this.em.flush()
    return true
  }

  async activateByUser(user: string) {
    return this.em.nativeUpdate(
      AssemblyEntity,
      { status: -1, user },
      { status: 0 },
    )
  }
}
