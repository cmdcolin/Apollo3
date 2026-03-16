import type {
  AnalysisDbRepository,
  AnalysisDbRow,
} from '@apollo-annotation/common'
import type { EntityManager, InferEntity } from '@mikro-orm/core'

import { AnalysisDbEntity } from '../entities/AnalysisDbEntity.js'
import { AssemblyEntity } from '../entities/AssemblyEntity.js'

function extractAssemblyIds(
  val: InferEntity<typeof AnalysisDbEntity>['assemblies'],
) {
  if (Array.isArray(val)) {
    return val.map((a) => (typeof a === 'string' ? a : a._id))
  }
  return [...val.getItems()].map((a) => a._id)
}

function toRow(entity: InferEntity<typeof AnalysisDbEntity>): AnalysisDbRow {
  return {
    _id: entity._id,
    name: entity.name,
    tool: entity.tool,
    dbPath: entity.dbPath ?? undefined,
    status: entity.status,
    params: entity.params,
    assemblyIds: extractAssemblyIds(entity.assemblies),
    createdBy: entity.createdBy ?? undefined,
  }
}

const POPULATE = { populate: ['assemblies'] } as const

export class MikroOrmAnalysisDbRepository implements AnalysisDbRepository {
  constructor(private readonly em: EntityManager) {}

  async findById(id: string) {
    const entity = await this.em.findOne(
      AnalysisDbEntity,
      { _id: id },
      POPULATE,
    )
    if (entity) {
      return toRow(entity)
    }
    return
  }

  async findByAssemblyId(assemblyId: string) {
    const entities = await this.em.find(
      AnalysisDbEntity,
      { assemblies: assemblyId },
      POPULATE,
    )
    return entities.map((e) => toRow(e))
  }

  async findByTool(tool: string) {
    const entities = await this.em.find(
      AnalysisDbEntity,
      { tool },
      POPULATE,
    )
    return entities.map((e) => toRow(e))
  }

  async findAll() {
    const entities = await this.em.find(AnalysisDbEntity, {}, POPULATE)
    return entities.map((e) => toRow(e))
  }

  async create(row: AnalysisDbRow) {
    const entity = this.em.create(AnalysisDbEntity, {
      _id: row._id,
      name: row.name,
      tool: row.tool,
      dbPath: row.dbPath,
      status: row.status,
      params: row.params,
      assemblies: row.assemblyIds.map((id) =>
        this.em.getReference(AssemblyEntity, id),
      ),
      createdBy: row.createdBy,
    })
    this.em.persist(entity)
    await this.em.flush()
    return toRow(entity)
  }

  async updateById(id: string, data: Partial<Omit<AnalysisDbRow, '_id'>>) {
    const entity = await this.em.findOne(
      AnalysisDbEntity,
      { _id: id },
      POPULATE,
    )
    if (!entity) {
      return
    }
    if (data.status !== undefined) {
      entity.status = data.status
    }
    if (data.dbPath !== undefined) {
      entity.dbPath = data.dbPath
    }
    if (data.params !== undefined) {
      entity.params = data.params
    }
    await this.em.flush()
    return toRow(entity)
  }

  async deleteById(id: string) {
    const entity = await this.em.findOne(AnalysisDbEntity, { _id: id })
    if (!entity) {
      return false
    }
    this.em.remove(entity)
    await this.em.flush()
    return true
  }

  async removeAssemblyFromDbs(assemblyId: string) {
    const entities = await this.em.find(
      AnalysisDbEntity,
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
