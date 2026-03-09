import type { AssemblyRepository, AssemblyRow } from '@apollo-annotation/common'
import type { EntityManager } from '@mikro-orm/core'

import { AssemblyEntity } from '../entities/AssemblyEntity.js'

function toRow(entity: AssemblyEntity): AssemblyRow {
  return {
    _id: entity._id,
    name: entity.name,
    displayName: entity.displayName,
    aliases: entity.aliases,
    description: entity.description,
    status: entity.status,
    user: entity.user,
    sequenceSource: entity.sequenceSource,
    checks: entity.checks,
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
    await this.em.persistAndFlush(entity)
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
    await this.em.removeAndFlush(entity)
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
