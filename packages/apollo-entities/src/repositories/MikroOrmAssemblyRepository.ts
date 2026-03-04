import type { AssemblyRepository, AssemblyRow } from '@apollo-annotation/common'
import { EntityManager } from '@mikro-orm/core'

import { AssemblyEntity } from '../entities/AssemblyEntity'

function toRow(entity: AssemblyEntity): AssemblyRow {
  return {
    _id: entity._id,
    name: entity.name,
    displayName: entity.displayName,
    aliases: entity.aliases,
    description: entity.description,
    status: entity.status,
    user: entity.user,
    externalLocation: entity.externalLocation,
    fileIds: entity.fileIds,
    checks: entity.checks,
    file: entity.file?._id,
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
      externalLocation: row.externalLocation,
      fileIds: row.fileIds,
      checks: row.checks,
      file: row.file ?? undefined,
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
}
