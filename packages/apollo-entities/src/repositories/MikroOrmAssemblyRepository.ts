import type { AssemblyRepository, AssemblyRow } from '@apollo-annotation/common'
import type { EntityManager, InferEntity } from '@mikro-orm/core'

import {
  AssemblyEntity,
  AssemblyVisibility,
} from '../entities/AssemblyEntity.js'

function organismId(val: InferEntity<typeof AssemblyEntity>['organism']) {
  if (!val) {
    return
  }
  if (typeof val === 'string') {
    return val
  }
  return val._id
}

function toRow(entity: InferEntity<typeof AssemblyEntity>): AssemblyRow {
  return {
    _id: entity._id,
    name: entity.name,
    displayName: entity.displayName ?? entity.name,
    aliases: entity.aliases ?? undefined,
    description: entity.description ?? undefined,
    user: entity.user ?? undefined,
    sequenceSource: entity.sequenceSource ?? undefined,
    checks: entity.checks ?? undefined,
    organism: organismId(entity.organism),
    visibility: entity.visibility,
  }
}

export class MikroOrmAssemblyRepository implements AssemblyRepository {
  constructor(private readonly em: EntityManager) {}

  async findById(id: string) {
    const entity = await this.em.findOne(AssemblyEntity, { _id: id })
    if (entity) {
      return toRow(entity)
    }
    return
  }

  async findByName(name: string) {
    const entity = await this.em.findOne(AssemblyEntity, { name })
    if (entity) {
      return toRow(entity)
    }
    return
  }

  async create(row: AssemblyRow) {
    const entity = this.em.create(AssemblyEntity, {
      _id: row._id,
      name: row.name,
      displayName: row.displayName,
      aliases: row.aliases,
      description: row.description,
      user: row.user,
      sequenceSource: row.sequenceSource,
      checks: row.checks,
      organism: row.organism,
      visibility: row.visibility as AssemblyVisibility | undefined,
    })
    this.em.persist(entity)
    await this.em.flush()
    return toRow(entity)
  }

  async updateById(id: string, data: Partial<Omit<AssemblyRow, '_id'>>) {
    const entity = await this.em.findOne(AssemblyEntity, { _id: id })
    if (!entity) {
      return
    }
    const { visibility, ...rest } = data
    const assignData: Record<string, unknown> = { ...rest }
    if (visibility !== undefined) {
      assignData.visibility = visibility as AssemblyVisibility
    }
    this.em.assign(entity, assignData)
    await this.em.flush()
    return toRow(entity)
  }

  async findAll() {
    const entities = await this.em.find(AssemblyEntity, {}, {})
    return entities.map((x) => toRow(x))
  }

  async findByIds(ids: string[]) {
    if (ids.length === 0) {
      return []
    }
    const entities = await this.em.find(
      AssemblyEntity,
      {
        _id: { $in: ids },
      },
      {},
    )
    return entities.map((x) => toRow(x))
  }

  async findByNames(names: string[]) {
    if (names.length === 0) {
      return []
    }
    const entities = await this.em.find(
      AssemblyEntity,
      {
        name: { $in: names },
      },
      {},
    )
    return entities.map((x) => toRow(x))
  }

  async findPublic() {
    const entities = await this.em.find(
      AssemblyEntity,
      {
        visibility: AssemblyVisibility.PUBLIC,
      },
      {},
    )
    return entities.map((x) => toRow(x))
  }

  async findAllIds() {
    const entities = await this.em.find(AssemblyEntity, {}, { fields: ['_id'] })
    return entities.map((e) => e._id)
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
}
