import type { BlastDbRepository, BlastDbRow } from '@apollo-annotation/common'
import type { EntityManager, InferEntity } from '@mikro-orm/core'

import { AssemblyEntity } from '../entities/AssemblyEntity.js'
import { BlastDbEntity } from '../entities/BlastDbEntity.js'

function extractAssemblyIds(
  val: InferEntity<typeof BlastDbEntity>['assemblies'],
) {
  if (Array.isArray(val)) {
    return val.map((a) => (typeof a === 'string' ? a : a._id))
  }
  return [...val.getItems()].map((a) => a._id)
}

function toRow(entity: InferEntity<typeof BlastDbEntity>): BlastDbRow {
  return {
    _id: entity._id,
    name: entity.name,
    program: entity.program,
    database: entity.database,
    assemblyIds: extractAssemblyIds(entity.assemblies),
    createdBy: entity.createdBy ?? undefined,
  }
}

const POPULATE = { populate: ['assemblies'] } as const

export class MikroOrmBlastDbRepository implements BlastDbRepository {
  constructor(private readonly em: EntityManager) {}

  async findById(id: string) {
    const entity = await this.em.findOne(BlastDbEntity, { _id: id }, POPULATE)
    if (entity) {
      return toRow(entity)
    }
    return
  }

  async findByAssemblyId(assemblyId: string) {
    const entities = await this.em.find(
      BlastDbEntity,
      { assemblies: assemblyId },
      POPULATE,
    )
    return entities.map((e) => toRow(e))
  }

  async findAll() {
    const entities = await this.em.find(BlastDbEntity, {}, POPULATE)
    return entities.map((e) => toRow(e))
  }

  async create(row: BlastDbRow) {
    const entity = this.em.create(BlastDbEntity, {
      _id: row._id,
      name: row.name,
      program: row.program,
      database: row.database,
      assemblies: row.assemblyIds.map((id) =>
        this.em.getReference(AssemblyEntity, id),
      ),
      createdBy: row.createdBy,
    })
    this.em.persist(entity)
    await this.em.flush()
    return toRow(entity)
  }

  async deleteById(id: string) {
    const entity = await this.em.findOne(BlastDbEntity, { _id: id })
    if (!entity) {
      return false
    }
    this.em.remove(entity)
    await this.em.flush()
    return true
  }

  async removeAssemblyFromBlastDbs(assemblyId: string) {
    const entities = await this.em.find(
      BlastDbEntity,
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
