import type { CheckRepository, CheckRow } from '@apollo-annotation/common'
import { EntityManager } from '@mikro-orm/core'

import { CheckEntity } from '../entities/CheckEntity'

function toRow(entity: CheckEntity): CheckRow {
  return {
    _id: entity._id,
    name: entity.name,
    causes: entity.causes,
    isDefault: entity.isDefault,
    version: entity.version,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  }
}

export class MikroOrmCheckRepository implements CheckRepository {
  constructor(private readonly em: EntityManager) {}

  async findAll() {
    const entities = await this.em.find(
      CheckEntity,
      {},
      { orderBy: { name: 'asc' } },
    )
    return entities.map(toRow)
  }

  async findDefaults() {
    const entities = await this.em.find(CheckEntity, { isDefault: true })
    return entities.map(toRow)
  }

  async findById(id: string) {
    const entity = await this.em.findOne(CheckEntity, { _id: id })
    if (entity) {
      return toRow(entity)
    }
    return undefined
  }

  async findByIds(ids: string[]) {
    if (ids.length === 0) {
      return []
    }
    const entities = await this.em.find(CheckEntity, { _id: { $in: ids } })
    return entities.map(toRow)
  }

  async upsert(row: CheckRow) {
    let entity = await this.em.findOne(CheckEntity, { _id: row._id })
    if (entity) {
      this.em.assign(entity, {
        name: row.name,
        causes: row.causes,
        isDefault: row.isDefault,
        version: row.version,
      })
    } else {
      entity = this.em.create(CheckEntity, {
        _id: row._id,
        name: row.name,
        causes: row.causes,
        isDefault: row.isDefault,
        version: row.version,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      this.em.persist(entity)
    }
    await this.em.flush()
    return toRow(entity)
  }
}
