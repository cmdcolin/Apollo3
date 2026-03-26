import type { CheckRepository, CheckRow } from '@apollo-annotation/common'
import type { EntityManager, InferEntity } from '@mikro-orm/core'

import { CheckEntity } from '../entities/CheckEntity.js'

function toRow(entity: InferEntity<typeof CheckEntity>): CheckRow {
  return {
    _id: entity._id,
    name: entity.name,
    causes: entity.causes ?? undefined,
    isDefault: entity.isDefault ?? undefined,
    version: entity.version ?? undefined,
    createdAt: entity.createdAt ?? undefined,
    updatedAt: entity.updatedAt ?? undefined,
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
    return entities.map((x) => toRow(x))
  }

  async findDefaults() {
    const entities = await this.em.find(CheckEntity, { isDefault: true }, {})
    return entities.map((x) => toRow(x))
  }

  async findById(id: string) {
    const entity = await this.em.findOne(CheckEntity, { _id: id })
    if (entity) {
      return toRow(entity)
    }
    return
  }

  async findByIds(ids: string[]) {
    if (ids.length === 0) {
      return []
    }
    const entities = await this.em.find(CheckEntity, { _id: { $in: ids } }, {})
    return entities.map((x) => toRow(x))
  }

  async findByName(name: string) {
    const entity = await this.em.findOne(CheckEntity, { name })
    if (entity) {
      return toRow(entity)
    }
    return
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
