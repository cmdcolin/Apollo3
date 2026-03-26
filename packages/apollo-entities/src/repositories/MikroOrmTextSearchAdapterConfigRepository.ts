import type {
  TextSearchAdapterConfigRepository,
  TextSearchAdapterConfigRow,
} from '@apollo-annotation/common'
import type { EntityManager, InferEntity } from '@mikro-orm/core'

import { AssemblyEntity } from '../entities/AssemblyEntity.js'
import { TextSearchAdapterConfigEntity } from '../entities/TextSearchAdapterConfigEntity.js'

function extractAssemblyIds(
  val: InferEntity<typeof TextSearchAdapterConfigEntity>['assemblies'],
) {
  if (Array.isArray(val)) {
    return val.map((a) => (typeof a === 'string' ? a : a._id))
  }
  return [...val.getItems()].map((a) => a._id)
}

function toRow(
  entity: InferEntity<typeof TextSearchAdapterConfigEntity>,
): TextSearchAdapterConfigRow {
  return {
    _id: entity._id,
    textSearchAdapterId: entity.textSearchAdapterId,
    assemblyIds: extractAssemblyIds(entity.assemblies),
    config: entity.config,
  }
}

const POPULATE = { populate: ['assemblies'] } as const

export class MikroOrmTextSearchAdapterConfigRepository implements TextSearchAdapterConfigRepository {
  constructor(private readonly em: EntityManager) {}

  async findById(id: string) {
    const entity = await this.em.findOne(
      TextSearchAdapterConfigEntity,
      { _id: id },
      POPULATE,
    )
    if (entity) {
      return toRow(entity)
    }
    return
  }

  async findByAdapterId(adapterId: string) {
    const entity = await this.em.findOne(
      TextSearchAdapterConfigEntity,
      { textSearchAdapterId: adapterId },
      POPULATE,
    )
    if (entity) {
      return toRow(entity)
    }
    return
  }

  async findByAssemblyId(assemblyId: string) {
    const entities = await this.em.find(
      TextSearchAdapterConfigEntity,
      { assemblies: assemblyId },
      POPULATE,
    )
    return entities.map((x) => toRow(x))
  }

  async findByAssemblyIds(assemblyIds: string[]) {
    if (assemblyIds.length === 0) {
      return []
    }
    const entities = await this.em.find(
      TextSearchAdapterConfigEntity,
      { assemblies: { $in: assemblyIds } },
      POPULATE,
    )
    return entities.map((x) => toRow(x))
  }

  async findAll() {
    const entities = await this.em.find(
      TextSearchAdapterConfigEntity,
      {},
      POPULATE,
    )
    return entities.map((x) => toRow(x))
  }

  async create(row: TextSearchAdapterConfigRow) {
    const entity = this.em.create(TextSearchAdapterConfigEntity, {
      _id: row._id,
      textSearchAdapterId: row.textSearchAdapterId,
      assemblies: row.assemblyIds.map((id) =>
        this.em.getReference(AssemblyEntity, id),
      ),
      config: row.config,
    })
    this.em.persist(entity)
    await this.em.flush()
    return toRow(entity)
  }

  async updateById(
    id: string,
    data: Partial<Omit<TextSearchAdapterConfigRow, '_id'>>,
  ) {
    const entity = await this.em.findOne(
      TextSearchAdapterConfigEntity,
      { _id: id },
      POPULATE,
    )
    if (!entity) {
      return
    }
    if (data.config !== undefined) {
      entity.config = data.config
    }
    if (data.assemblyIds) {
      entity.assemblies.set(
        data.assemblyIds.map((id) => this.em.getReference(AssemblyEntity, id)),
      )
    }
    await this.em.flush()
    return toRow(entity)
  }

  async deleteById(id: string) {
    const entity = await this.em.findOne(TextSearchAdapterConfigEntity, {
      _id: id,
    })
    if (!entity) {
      return false
    }
    this.em.remove(entity)
    await this.em.flush()
    return true
  }

  async removeAssemblyFromAdapters(assemblyId: string) {
    const entities = await this.em.find(
      TextSearchAdapterConfigEntity,
      { assemblies: assemblyId },
      POPULATE,
    )
    for (const entity of entities) {
      entity.assemblies.remove((a) => a._id === assemblyId)
      if (entity.assemblies.length === 0) {
        this.em.remove(entity)
      }
    }
    await this.em.flush()
  }
}
