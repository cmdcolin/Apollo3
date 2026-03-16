import { randomBytes } from 'node:crypto'

import type { ChangeRepository, ChangeRow } from '@apollo-annotation/common'
import {
  type EntityManager,
  type InferEntity,
  QueryOrder,
  raw,
} from '@mikro-orm/core'

import { ChangeEntity } from '../entities/ChangeEntity.js'

function generateId() {
  return randomBytes(12).toString('hex')
}

function toRow(entity: InferEntity<typeof ChangeEntity>): ChangeRow {
  return {
    _id: entity._id,
    assembly: entity.assembly ?? undefined,
    geneId: entity.geneId ?? undefined,
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
    filter?: Partial<Pick<ChangeRow, 'assembly' | 'user' | 'typeName' | 'geneId'>>
    changedIds?: string[]
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
      if (opts.filter.geneId) {
        where.geneId = opts.filter.geneId
      }
    }
    if (opts?.sinceSequence !== undefined) {
      where.sequence = { $gt: opts.sinceSequence }
    }
    if (opts?.changedIds && opts.changedIds.length > 0) {
      // LIKE on the JSON column to find candidates, then in-memory exact check
      const orConditions = opts.changedIds.map((id) => ({
        [raw('changedIds')]: { $like: `%"${id}"%` },
      }))
      if (orConditions.length === 1) {
        Object.assign(where, orConditions[0])
      } else {
        where.$or = orConditions
      }
    }

    const orderBy = {
      sequence: opts?.sort === 'asc' ? QueryOrder.ASC : QueryOrder.DESC,
    }

    const entities = await this.em.find(ChangeEntity, where, {
      orderBy,
      limit: opts?.changedIds ? undefined : opts?.limit,
      offset: opts?.changedIds ? undefined : opts?.offset,
    })

    if (opts?.changedIds && opts.changedIds.length > 0) {
      const idSet = new Set(opts.changedIds)
      const matched = entities.filter((e) =>
        e.changedIds.some((id) => idSet.has(id)),
      )
      const start = opts.offset ?? 0
      const end = opts.limit ? start + opts.limit : undefined
      return matched.slice(start, end).map(toRow)
    }
    return entities.map(toRow)
  }

  async countByGeneId(geneId: string) {
    return this.em.count(ChangeEntity, { geneId })
  }

  async updateGeneId(changeId: string, geneId: string) {
    const entity = await this.em.findOneOrFail(ChangeEntity, { _id: changeId })
    entity.geneId = geneId
    await this.em.flush()
  }
}
