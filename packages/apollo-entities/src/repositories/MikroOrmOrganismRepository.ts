import type {
  OrganismRepository,
  OrganismRow,
  PaginationOptions,
} from '@apollo-annotation/common'
import type { EntityManager, InferEntity } from '@mikro-orm/core'

import { OrganismEntity } from '../entities/OrganismEntity.js'

function toRow(entity: InferEntity<typeof OrganismEntity>): OrganismRow {
  return {
    _id: entity._id,
    taxid: entity.taxid ?? undefined,
    genus: entity.genus ?? undefined,
    species: entity.species ?? undefined,
    commonName: entity.commonName ?? undefined,
    description: entity.description ?? undefined,
    user: entity.user ?? undefined,
    createdAt: entity.createdAt ?? undefined,
    updatedAt: entity.updatedAt ?? undefined,
  }
}

export class MikroOrmOrganismRepository implements OrganismRepository {
  constructor(private readonly em: EntityManager) {}

  async findById(id: string) {
    const entity = await this.em.findOne(OrganismEntity, { _id: id })
    if (entity) {
      return toRow(entity)
    }
    return
  }

  async findByTaxid(taxid: number) {
    const entity = await this.em.findOne(OrganismEntity, { taxid })
    if (entity) {
      return toRow(entity)
    }
    return
  }

  async findAll(opts?: PaginationOptions) {
    const entities = await this.em.find(
      OrganismEntity,
      {},
      {
        offset: opts?.offset,
        limit: opts?.limit,
      },
    )
    return entities.map(toRow)
  }

  async count() {
    return this.em.count(OrganismEntity, {})
  }

  async create(row: OrganismRow) {
    const entity = this.em.create(OrganismEntity, {
      _id: row._id,
      taxid: row.taxid,
      genus: row.genus,
      species: row.species,
      commonName: row.commonName,
      description: row.description,
      user: row.user,
    })
    this.em.persist(entity)
    await this.em.flush()
    return toRow(entity)
  }

  async updateById(id: string, data: Partial<Omit<OrganismRow, '_id'>>) {
    const entity = await this.em.findOne(OrganismEntity, { _id: id })
    if (!entity) {
      return
    }
    this.em.assign(entity, data)
    await this.em.flush()
    return toRow(entity)
  }

  async deleteById(id: string) {
    const entity = await this.em.findOne(OrganismEntity, { _id: id })
    if (!entity) {
      return false
    }
    this.em.remove(entity)
    await this.em.flush()
    return true
  }
}
