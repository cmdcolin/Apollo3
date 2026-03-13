import type { FeatureRepository, FeatureRow } from '@apollo-annotation/common'
import type { EntityManager } from '@mikro-orm/core'

import { FeatureEntity } from '../entities/FeatureEntity.js'

// English stop words matching MongoDB's default text search behavior
const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'but',
  'by',
  'for',
  'if',
  'in',
  'into',
  'is',
  'it',
  'no',
  'not',
  'of',
  'on',
  'or',
  'such',
  'that',
  'the',
  'their',
  'then',
  'there',
  'these',
  'they',
  'this',
  'to',
  'was',
  'will',
  'with',
  'both',
])

function tokenize(text: string) {
  return text.toLowerCase().match(/[a-z0-9_]+/g) ?? []
}

function stem(word: string) {
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) {
    return word.slice(0, -1)
  }
  return word
}

function matchesPhrase(textTokens: string[], queryTokens: string[]) {
  if (queryTokens.length === 0) {
    return false
  }
  const stemmedQuery = queryTokens.map(stem)
  if (queryTokens.length === 1) {
    return textTokens.some((t) => stem(t) === stemmedQuery[0])
  }
  for (let i = 0; i <= textTokens.length - queryTokens.length; i++) {
    let match = true
    for (let j = 0; j < queryTokens.length; j++) {
      if (stem(textTokens[i + j]!) !== stemmedQuery[j]) {
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

  async findAll() {
    const entities = await this.em.find(FeatureEntity, {})
    return entities.map(toRow)
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
    let parentIds = [rootId]
    while (parentIds.length > 0) {
      const children = await this.em.find(FeatureEntity, {
        parent: { $in: parentIds },
      })
      parentIds = []
      for (const child of children) {
        results.push(toRow(child))
        parentIds.push(child._id)
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
    const allIds: string[] = []
    let parentIds = [id]
    while (parentIds.length > 0) {
      const children = await this.em.find(FeatureEntity, {
        parent: { $in: parentIds },
      })
      parentIds = []
      for (const child of children) {
        allIds.push(child._id)
        parentIds.push(child._id)
      }
    }
    if (allIds.length === 0) {
      return 0
    }
    return this.em.nativeDelete(FeatureEntity, { _id: { $in: allIds } })
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
    const queryTokens = tokenize(query)
    if (
      queryTokens.length === 0 ||
      queryTokens.every((t) => STOP_WORDS.has(t))
    ) {
      return []
    }
    const entities = await this.em.find(FeatureEntity, {
      refSeq: { $in: refSeqIds },
    })
    const matchingIds = new Set<string>()
    for (const entity of entities) {
      const text = entity.type + ' ' + JSON.stringify(entity.attributes ?? {})
      const textTokens = tokenize(text)
      if (matchesPhrase(textTokens, queryTokens)) {
        matchingIds.add(entity._id)
      }
    }
    if (matchingIds.size === 0) {
      return []
    }
    const parentMap = new Map<string, string | undefined>()
    for (const entity of entities) {
      const parentId =
        entity.parent == null
          ? undefined
          : typeof entity.parent === 'string'
            ? entity.parent
            : entity.parent._id
      parentMap.set(entity._id, parentId)
    }
    const rootIds = new Set<string>()
    for (const id of matchingIds) {
      let current = id
      let parentId = parentMap.get(current)
      while (parentId !== undefined) {
        current = parentId
        parentId = parentMap.get(current)
      }
      rootIds.add(current)
    }
    return entities
      .filter((entity) => rootIds.has(entity._id) && entity.parent == null)
      .map(toRow)
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
