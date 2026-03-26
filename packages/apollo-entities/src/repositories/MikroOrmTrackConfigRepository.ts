import type {
  TrackConfigRepository,
  TrackConfigRow,
} from '@apollo-annotation/common'
import type { EntityManager, InferEntity } from '@mikro-orm/core'

import { AssemblyEntity } from '../entities/AssemblyEntity.js'
import { TrackConfigEntity } from '../entities/TrackConfigEntity.js'

function extractAssemblyIds(
  val: InferEntity<typeof TrackConfigEntity>['assemblies'],
) {
  if (Array.isArray(val)) {
    return val.map((a) => (typeof a === 'string' ? a : a._id))
  }
  return [...val.getItems()].map((a) => a._id)
}

function toRow(entity: InferEntity<typeof TrackConfigEntity>): TrackConfigRow {
  return {
    _id: entity._id,
    trackId: entity.trackId,
    assemblyIds: extractAssemblyIds(entity.assemblies),
    config: entity.config,
    createdBy: entity.createdBy ?? undefined,
  }
}

const POPULATE = { populate: ['assemblies'] } as const

export class MikroOrmTrackConfigRepository implements TrackConfigRepository {
  constructor(private readonly em: EntityManager) {}

  async findById(id: string) {
    const entity = await this.em.findOne(
      TrackConfigEntity,
      { _id: id },
      POPULATE,
    )
    if (entity) {
      return toRow(entity)
    }
    return
  }

  async findByTrackId(trackId: string) {
    const entity = await this.em.findOne(
      TrackConfigEntity,
      { trackId },
      POPULATE,
    )
    if (entity) {
      return toRow(entity)
    }
    return
  }

  async findByAssemblyId(assemblyId: string) {
    const entities = await this.em.find(
      TrackConfigEntity,
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
      TrackConfigEntity,
      { assemblies: { $in: assemblyIds } },
      POPULATE,
    )
    return entities.map((x) => toRow(x))
  }

  async findAll() {
    const entities = await this.em.find(TrackConfigEntity, {}, POPULATE)
    return entities.map((x) => toRow(x))
  }

  async create(row: TrackConfigRow) {
    const entity = this.em.create(TrackConfigEntity, {
      _id: row._id,
      trackId: row.trackId,
      assemblies: row.assemblyIds.map((id) =>
        this.em.getReference(AssemblyEntity, id),
      ),
      config: row.config,
      createdBy: row.createdBy,
    })
    this.em.persist(entity)
    await this.em.flush()
    return toRow(entity)
  }

  async updateById(id: string, data: Partial<Omit<TrackConfigRow, '_id'>>) {
    const entity = await this.em.findOne(
      TrackConfigEntity,
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
    const entity = await this.em.findOne(TrackConfigEntity, { _id: id })
    if (!entity) {
      return false
    }
    this.em.remove(entity)
    await this.em.flush()
    return true
  }

  async removeAssemblyFromTracks(assemblyId: string) {
    const entities = await this.em.find(
      TrackConfigEntity,
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
