import type { FeatureRepository, FeatureRow } from '@apollo-annotation/common'
import type { EntityManager, InferEntity } from '@mikro-orm/core'

import { FeatureEntity } from '../entities/FeatureEntity.js'

export const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'if', 'in',
  'into', 'is', 'it', 'no', 'not', 'of', 'on', 'or', 'such', 'that', 'the',
  'their', 'then', 'there', 'these', 'they', 'this', 'to', 'was', 'will',
  'with', 'both',
])

export function tokenize(text: string) {
  return text.toLowerCase().match(/[a-z0-9_]+/g) ?? []
}

export function stem(word: string) {
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) {
    return word.slice(0, -1)
  }
  return word
}

export function matchesPhrase(textTokens: string[], queryTokens: string[]) {
  if (queryTokens.length === 0) {
    return false
  }
  const stemmedQuery = queryTokens.map((w) => stem(w))
  if (queryTokens.length === 1) {
    return textTokens.some((t) => stem(t) === stemmedQuery[0])
  }
  for (let i = 0; i <= textTokens.length - queryTokens.length; i++) {
    let match = true
    for (let j = 0; j < queryTokens.length; j++) {
      if (stem(textTokens[i + j] ?? '') !== stemmedQuery[j]) {
        match = false
        break
      }
    }
    if (match) {
      return true
    }
  }
  return false
}

export function entityToRow(entity: InferEntity<typeof FeatureEntity>): FeatureRow {
  return {
    _id: entity._id,
    parentId: entity.parent?._id ?? undefined,
    refSeq:
      typeof entity.refSeq === 'string' ? entity.refSeq : entity.refSeq._id,
    type: entity.type,
    min: entity.min,
    max: entity.max,
    strand: (entity.strand ?? undefined) as 1 | -1 | undefined,
    phase: (entity.phase ?? undefined) as 0 | 1 | 2 | undefined,
    attributes: entity.attributes ?? undefined,
    status: entity.status ?? undefined,
    user: entity.user ?? undefined,
    createdAt: entity.createdAt ?? undefined,
    updatedAt: entity.updatedAt ?? undefined,
  }
}

/**
 * Base class with shared CRUD methods that work with any MikroORM driver.
 * Subclasses implement the tree-traversal and text-search methods that
 * require driver-specific strategies (recursive CTEs for SQL, iterative
 * BFS for MongoDB).
 */
export abstract class BaseFeatureRepository implements FeatureRepository {
  constructor(protected readonly em: EntityManager) {}

  async findAll() {
    const entities = await this.em.find(FeatureEntity, {})
    return entities.map((e) => entityToRow(e))
  }

  async countAll() {
    return this.em.count(FeatureEntity)
  }

  async countByRange(refSeqId: string, start: number, end: number) {
    return this.em.count(FeatureEntity, {
      refSeq: refSeqId,
      min: { $lte: end },
      max: { $gte: start },
    })
  }

  async findById(id: string) {
    const entity = await this.em.findOne(FeatureEntity, { _id: id })
    if (entity) {
      return entityToRow(entity)
    }
    return
  }

  async findByIds(ids: string[]) {
    if (ids.length === 0) {
      return []
    }
    const entities = await this.em.find(FeatureEntity, { _id: { $in: ids } })
    return entities.map((e) => entityToRow(e))
  }

  async findByRange(refSeqId: string, start: number, end: number) {
    const entities = await this.em.find(FeatureEntity, {
      refSeq: refSeqId,
      min: { $lte: end },
      max: { $gte: start },
    })
    return entities.map((e) => entityToRow(e))
  }

  async findRootsByRange(refSeqId: string, start: number, end: number) {
    const entities = await this.em.find(FeatureEntity, {
      refSeq: refSeqId,
      parent: null,
      min: { $lte: end },
      max: { $gte: start },
    })
    return entities.map((e) => entityToRow(e))
  }

  async findChildren(parentId: string) {
    const entities = await this.em.find(FeatureEntity, { parent: parentId })
    return entities.map((e) => entityToRow(e))
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
    this.em.persist(entity)
    await this.em.flush()
    return entityToRow(entity)
  }

  async createMany(rows: FeatureRow[]) {
    if (rows.length === 0) {
      return []
    }
    const now = new Date()
    const data = rows.map((row) => ({
      _id: row._id,
      parent: row.parentId ?? null,
      refSeq: row.refSeq,
      type: row.type,
      min: row.min,
      max: row.max,
      strand: row.strand ?? null,
      phase: row.phase ?? null,
      attributes: row.attributes ?? null,
      status: row.status ?? null,
      user: row.user ?? null,
      createdAt: row.createdAt ?? now,
      updatedAt: row.updatedAt ?? now,
    }))
    await this.em.insertMany(FeatureEntity, data)
    return rows
  }

  async updateById(id: string, data: Partial<Omit<FeatureRow, '_id'>>) {
    const entity = await this.em.findOne(FeatureEntity, { _id: id })
    if (!entity) {
      return
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
    return entityToRow(entity)
  }

  async deleteById(id: string) {
    const entity = await this.em.findOne(FeatureEntity, { _id: id })
    if (!entity) {
      return false
    }
    this.em.remove(entity)
    await this.em.flush()
    return true
  }

  async deleteByRefSeqs(refSeqIds: string[]) {
    return this.em.nativeDelete(FeatureEntity, {
      refSeq: { $in: refSeqIds },
    })
  }

  async activateByUser(user: string) {
    return this.em.nativeUpdate(
      FeatureEntity,
      { status: -1, user },
      { status: 0 },
    )
  }

  abstract findDescendants(rootId: string): Promise<FeatureRow[]>
  abstract findDescendantsOfMany(rootIds: string[]): Promise<FeatureRow[]>
  abstract deleteDescendants(id: string): Promise<number>
  abstract searchText(refSeqIds: string[], query: string): Promise<FeatureRow[]>
  abstract findByIndexedId(id: string, refSeqIds?: string[]): Promise<FeatureRow[]>
  abstract findRootParent(id: string): Promise<FeatureRow | undefined>
}
