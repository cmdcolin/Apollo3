import type { FeatureRepository, FeatureRow } from '@apollo-annotation/common'
import { type EntityManager, raw } from '@mikro-orm/core'

import { FeatureEntity } from '../entities/FeatureEntity.js'

function toRow(entity: FeatureEntity): FeatureRow {
  return {
    _id: entity._id,
    parentId: entity.parent?._id ?? undefined,
    refSeq:
      typeof entity.refSeq === 'string' ? entity.refSeq : entity.refSeq._id,
    type: entity.type,
    min: entity.min,
    max: entity.max,
    strand: entity.strand ?? undefined,
    phase: entity.phase ?? undefined,
    attributes: entity.attributes ?? undefined,
    status: entity.status ?? undefined,
    user: entity.user ?? undefined,
    createdAt: entity.createdAt ?? undefined,
    updatedAt: entity.updatedAt ?? undefined,
  }
}

export class MikroOrmFeatureRepository implements FeatureRepository {
  constructor(private readonly em: EntityManager) {}

  async findById(id: string) {
    const entity = await this.em.findOne(FeatureEntity, { _id: id })
    if (entity) {
      return toRow(entity)
    }
    return undefined
  }

  async findByIds(ids: string[]) {
    const entities = await this.em.find(FeatureEntity, { _id: { $in: ids } })
    return entities.map(toRow)
  }

  async findByRange(refSeqId: string, start: number, end: number) {
    const entities = await this.em.find(FeatureEntity, {
      refSeq: refSeqId,
      min: { $lte: end },
      max: { $gte: start },
    })
    return entities.map(toRow)
  }

  async findRootsByRange(refSeqId: string, start: number, end: number) {
    const entities = await this.em.find(FeatureEntity, {
      refSeq: refSeqId,
      parent: null,
      min: { $lte: end },
      max: { $gte: start },
    })
    return entities.map(toRow)
  }

  async findChildren(parentId: string) {
    const entities = await this.em.find(FeatureEntity, { parent: parentId })
    return entities.map(toRow)
  }

  async findDescendants(rootId: string) {
    const results: FeatureRow[] = []
    const queue = [rootId]
    while (queue.length > 0) {
      const parentId = queue.shift()!
      const children = await this.em.find(FeatureEntity, {
        parent: parentId,
      })
      for (const child of children) {
        results.push(toRow(child))
        queue.push(child._id)
      }
    }
    return results
  }

  async create(row: FeatureRow) {
    const entity = this.em.create(FeatureEntity, {
      _id: row._id,
      parent: row.parentId ?? undefined,
      refSeq: row.refSeq,
      type: row.type,
      min: row.min,
      max: row.max,
      strand: row.strand,
      phase: row.phase,
      attributes: row.attributes,
      status: row.status,
      user: row.user,
      createdAt: row.createdAt ?? new Date(),
      updatedAt: row.updatedAt ?? new Date(),
    })
    await this.em.persistAndFlush(entity)
    return toRow(entity)
  }

  async createMany(rows: FeatureRow[]) {
    const entities: FeatureEntity[] = []
    for (const row of rows) {
      const entity = this.em.create(FeatureEntity, {
        _id: row._id,
        parent: row.parentId ?? undefined,
        refSeq: row.refSeq,
        type: row.type,
        min: row.min,
        max: row.max,
        strand: row.strand,
        phase: row.phase,
        attributes: row.attributes,
        status: row.status,
        user: row.user,
        createdAt: row.createdAt ?? new Date(),
        updatedAt: row.updatedAt ?? new Date(),
      })
      entities.push(entity)
    }
    await this.em.persistAndFlush(entities)
    return entities.map(toRow)
  }

  async updateById(id: string, data: Partial<Omit<FeatureRow, '_id'>>) {
    const entity = await this.em.findOne(FeatureEntity, { _id: id })
    if (!entity) {
      return undefined
    }
    if (data.parentId !== undefined) {
      entity.parent = data.parentId
        ? this.em.getReference(FeatureEntity, data.parentId)
        : undefined
    }
    if (data.type !== undefined) {
      entity.type = data.type
    }
    if (data.min !== undefined) {
      entity.min = data.min
    }
    if (data.max !== undefined) {
      entity.max = data.max
    }
    if (data.strand !== undefined) {
      entity.strand = data.strand
    }
    if (data.phase !== undefined) {
      entity.phase = data.phase
    }
    if (data.attributes !== undefined) {
      entity.attributes = data.attributes
    }
    if (data.status !== undefined) {
      entity.status = data.status
    }
    if (data.user !== undefined) {
      entity.user = data.user
    }
    await this.em.flush()
    return toRow(entity)
  }

  async deleteById(id: string) {
    const entity = await this.em.findOne(FeatureEntity, { _id: id })
    if (!entity) {
      return false
    }
    await this.em.removeAndFlush(entity)
    return true
  }

  async deleteDescendants(id: string) {
    let count = 0
    const queue = [id]
    while (queue.length > 0) {
      const parentId = queue.shift()!
      const children = await this.em.find(FeatureEntity, {
        parent: parentId,
      })
      for (const child of children) {
        queue.push(child._id)
        await this.em.removeAndFlush(child)
        count++
      }
    }
    return count
  }

  async deleteByRefSeqs(refSeqIds: string[]) {
    return this.em.nativeDelete(FeatureEntity, {
      refSeq: { $in: refSeqIds },
    })
  }

  async searchText(refSeqIds: string[], query: string) {
    if (refSeqIds.length === 0) {
      return []
    }
    const pattern = `%${query}%`
    const entities = await this.em.find(FeatureEntity, {
      refSeq: { $in: refSeqIds },
      $or: [
        { type: { $like: pattern } },
        { [raw('attributes')]: { $like: pattern } },
      ],
    })
    return entities.map(toRow)
  }

  async activateByUser(user: string) {
    return this.em.nativeUpdate(
      FeatureEntity,
      { status: -1, user },
      { status: 0 },
    )
  }

  async findByIndexedId(id: string, refSeqIds?: string[]) {
    const filter: Record<string, unknown> = {
      parent: null,
    }
    if (refSeqIds && refSeqIds.length > 0) {
      filter.refSeq = { $in: refSeqIds }
    }
    const roots = await this.em.find(FeatureEntity, filter)
    const results: FeatureRow[] = []
    for (const root of roots) {
      if (await this.treeContainsIndexedId(root, id)) {
        results.push(toRow(root))
      }
    }
    return results
  }

  private async treeContainsIndexedId(
    entity: FeatureEntity,
    id: string,
  ): Promise<boolean> {
    if (entity.attributes) {
      for (const values of Object.values(entity.attributes)) {
        if (values.includes(id)) {
          return true
        }
      }
    }
    const children = await this.em.find(FeatureEntity, {
      parent: entity._id,
    })
    for (const child of children) {
      if (await this.treeContainsIndexedId(child, id)) {
        return true
      }
    }
    return false
  }

  async findRootParent(id: string) {
    const initial = await this.em.findOne(FeatureEntity, { _id: id })
    if (!initial) {
      return undefined
    }
    let entity: FeatureEntity = initial
    while (entity.parent) {
      const parentId =
        typeof entity.parent === 'string' ? entity.parent : entity.parent._id
      const parent = await this.em.findOne(FeatureEntity, { _id: parentId })
      if (!parent) {
        break
      }
      entity = parent
    }
    return toRow(entity)
  }
}
