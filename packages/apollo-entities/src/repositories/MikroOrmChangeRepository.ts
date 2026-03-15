import { randomBytes } from 'node:crypto'

import type { ChangeRepository, ChangeRow } from '@apollo-annotation/common'
import {
  type EntityManager,
  type InferEntity,
  QueryOrder,
} from '@mikro-orm/core'

import { ChangeEntity } from '../entities/ChangeEntity.js'

function generateId() {
  return randomBytes(12).toString('hex')
}

function toRow(entity: InferEntity<typeof ChangeEntity>): ChangeRow {
  return {
    _id: entity._id,
    assembly: entity.assembly ?? undefined,
    typeName: entity.typeName,
    changedIds: entity.changedIds,
    changes: entity.changes,
    user: entity.user,
    sequence: entity.sequence ?? undefined,
    createdAt: entity.createdAt ?? undefined,
    updatedAt: entity.updatedAt ?? undefined,
  }
}

export class MikroOrmChangeRepository implements ChangeRepository {
  constructor(private readonly em: EntityManager) {}

  async create(row: Omit<ChangeRow, '_id'>) {
    const entity = this.em.create(ChangeEntity, {
      _id: generateId(),
      ...row,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    this.em.persist(entity)
    await this.em.flush()
    return toRow(entity)
  }

  async findAll(opts?: {
    filter?: Partial<Pick<ChangeRow, 'assembly' | 'user' | 'typeName'>>
    sinceSequence?: number
    sort?: 'asc' | 'desc'
    limit?: number
    offset?: number
  }) {
    const where: Record<string, unknown> = {}
    if (opts?.filter) {
      if (opts.filter.assembly) {
        where.assembly = opts.filter.assembly
      }
      if (opts.filter.user) {
        where.user = { $like: `%${opts.filter.user}%` }
      }
      if (opts.filter.typeName) {
        where.typeName = opts.filter.typeName
      }
    }
    if (opts?.sinceSequence !== undefined) {
      where.sequence = { $gt: opts.sinceSequence }
    }

    const orderBy = {
      sequence: opts?.sort === 'asc' ? QueryOrder.ASC : QueryOrder.DESC,
    }

    const entities = await this.em.find(ChangeEntity, where, {
      orderBy,
      limit: opts?.limit,
      offset: opts?.offset,
    })
    return entities.map(toRow)
  }
}
