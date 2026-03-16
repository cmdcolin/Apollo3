import type {
  AssemblyPermissionRepository,
  AssemblyPermissionRow,
} from '@apollo-annotation/common'
import type { EntityManager, InferEntity } from '@mikro-orm/core'

import {
  AssemblyPermissionEntity,
  type AssemblyRole,
} from '../entities/AssemblyPermissionEntity.js'

function userId(val: InferEntity<typeof AssemblyPermissionEntity>['user']) {
  if (typeof val === 'string') {
    return val
  }
  return val._id
}

function assemblyId(
  val: InferEntity<typeof AssemblyPermissionEntity>['assembly'],
) {
  if (typeof val === 'string') {
    return val
  }
  return val._id
}

function toRow(
  entity: InferEntity<typeof AssemblyPermissionEntity>,
): AssemblyPermissionRow {
  return {
    _id: entity._id,
    user: userId(entity.user),
    assembly: assemblyId(entity.assembly),
    role: entity.role,
  }
}

export class MikroOrmAssemblyPermissionRepository implements AssemblyPermissionRepository {
  constructor(private readonly em: EntityManager) {}

  async findById(id: string) {
    const entity = await this.em.findOne(AssemblyPermissionEntity, { _id: id })
    if (entity) {
      return toRow(entity)
    }
    return
  }

  async findByUser(userIdVal: string) {
    const entities = await this.em.find(AssemblyPermissionEntity, {
      user: userIdVal,
    })
    return entities.map(toRow)
  }

  async findByAssembly(assemblyIdVal: string) {
    const entities = await this.em.find(AssemblyPermissionEntity, {
      assembly: assemblyIdVal,
    })
    return entities.map(toRow)
  }

  async findByUserAndAssembly(userIdVal: string, assemblyIdVal: string) {
    const entity = await this.em.findOne(AssemblyPermissionEntity, {
      user: userIdVal,
      assembly: assemblyIdVal,
    })
    if (entity) {
      return toRow(entity)
    }
    return
  }

  async create(row: AssemblyPermissionRow) {
    const entity = this.em.create(AssemblyPermissionEntity, {
      _id: row._id,
      user: row.user,
      assembly: row.assembly,
      role: row.role as AssemblyRole,
    })
    this.em.persist(entity)
    await this.em.flush()
    return toRow(entity)
  }

  async deleteById(id: string) {
    const entity = await this.em.findOne(AssemblyPermissionEntity, { _id: id })
    if (!entity) {
      return false
    }
    this.em.remove(entity)
    await this.em.flush()
    return true
  }

  async deleteByUserAndAssembly(userIdVal: string, assemblyIdVal: string) {
    const entity = await this.em.findOne(AssemblyPermissionEntity, {
      user: userIdVal,
      assembly: assemblyIdVal,
    })
    if (!entity) {
      return false
    }
    this.em.remove(entity)
    await this.em.flush()
    return true
  }

  async deleteByAssembly(assemblyIdVal: string) {
    await this.em.nativeDelete(AssemblyPermissionEntity, {
      assembly: assemblyIdVal,
    })
  }
}
