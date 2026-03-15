import type {
  JBrowseConfigRepository,
  JBrowseConfigRow,
} from '@apollo-annotation/common'
import type { EntityManager, InferEntity } from '@mikro-orm/core'

import { JBrowseConfigEntity } from '../entities/JBrowseConfigEntity.js'

function toRow(entity: InferEntity<typeof JBrowseConfigEntity>): JBrowseConfigRow {
  return {
    _id: entity._id,
    config: entity.config,
  }
}

export class MikroOrmJBrowseConfigRepository
  implements JBrowseConfigRepository
{
  constructor(private readonly em: EntityManager) {}

  async findOne() {
    const [entity] = await this.em.find(JBrowseConfigEntity, {}, { limit: 1 })
    if (entity) {
      return toRow(entity)
    }
    return
  }

  async deleteAll() {
    await this.em.nativeDelete(JBrowseConfigEntity, {})
  }

  async upsert(row: JBrowseConfigRow) {
    let entity = await this.em.findOne(JBrowseConfigEntity, {
      _id: row._id,
    })
    if (entity) {
      entity.config = row.config
    } else {
      entity = this.em.create(JBrowseConfigEntity, {
        _id: row._id,
        config: row.config,
      })
      this.em.persist(entity)
    }
    await this.em.flush()
    return toRow(entity)
  }
}
