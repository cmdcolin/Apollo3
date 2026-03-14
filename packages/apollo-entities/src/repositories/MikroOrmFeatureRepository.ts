import type { FeatureRepository, FeatureRow } from '@apollo-annotation/common'
import type { EntityManager, InferEntity } from '@mikro-orm/core'

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

interface RawFeatureRow {
  _id: string
  parent__id: string | null
  ref_seq__id: string
  type: string
  min: number
  max: number
  strand: number | null
  phase: number | null
  attributes: string | null
  status: number | null
  user: string | null
  created_at: string | null
  updated_at: string | null
}

function rawToRow(raw: RawFeatureRow): FeatureRow {
  return {
    _id: raw._id,
    parentId: raw.parent__id ?? undefined,
    refSeq: raw.ref_seq__id,
    type: raw.type,
    min: raw.min,
    max: raw.max,
    strand: (raw.strand ?? undefined) as 1 | -1 | undefined,
    phase: (raw.phase ?? undefined) as 0 | 1 | 2 | undefined,
    attributes: raw.attributes
      ? (JSON.parse(raw.attributes) as Record<string, string[]>)
      : undefined,
    status: raw.status ?? undefined,
    user: raw.user ?? undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
  }
}

function toRow(entity: InferEntity<typeof FeatureEntity>): FeatureRow {
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

function placeholders(count: number) {
  return Array.from({ length: count }, () => '?').join(', ')
}

export class MikroOrmFeatureRepository implements FeatureRepository {
  constructor(private readonly em: EntityManager) {}

  async findAll() {
    const rows = (await this.em.getConnection().execute(
      'SELECT * FROM feature',
    )) as RawFeatureRow[]
    return rows.map(rawToRow)
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
    const rows = (await this.em.getConnection().execute(
      'SELECT * FROM feature WHERE _id = ?',
      [id],
    )) as RawFeatureRow[]
    if (rows.length > 0) {
      return rawToRow(rows[0]!)
    }
    return undefined
  }

  async findByIds(ids: string[]) {
    if (ids.length === 0) {
      return []
    }
    const rows = (await this.em.getConnection().execute(
      `SELECT * FROM feature WHERE _id IN (${placeholders(ids.length)})`,
      ids,
    )) as RawFeatureRow[]
    return rows.map(rawToRow)
  }

  async findByRange(refSeqId: string, start: number, end: number) {
    const rows = (await this.em.getConnection().execute(
      'SELECT * FROM feature WHERE ref_seq__id = ? AND min <= ? AND max >= ?',
      [refSeqId, end, start],
    )) as RawFeatureRow[]
    return rows.map(rawToRow)
  }

  async findRootsByRange(refSeqId: string, start: number, end: number) {
    const rows = (await this.em.getConnection().execute(
      'SELECT * FROM feature WHERE ref_seq__id = ? AND parent__id IS NULL AND min <= ? AND max >= ?',
      [refSeqId, end, start],
    )) as RawFeatureRow[]
    return rows.map(rawToRow)
  }

  async findChildren(parentId: string) {
    const rows = (await this.em.getConnection().execute(
      'SELECT * FROM feature WHERE parent__id = ?',
      [parentId],
    )) as RawFeatureRow[]
    return rows.map(rawToRow)
  }

  async findDescendants(rootId: string) {
    return this.findDescendantsOfMany([rootId])
  }

  async findDescendantsOfMany(rootIds: string[]) {
    if (rootIds.length === 0) {
      return []
    }
    const rows = (await this.em.getConnection().execute(
      `WITH RECURSIVE tree AS (
        SELECT f.* FROM feature f WHERE f.parent__id IN (${placeholders(rootIds.length)})
        UNION ALL
        SELECT f.* FROM feature f JOIN tree t ON f.parent__id = t._id
      )
      SELECT * FROM tree`,
      rootIds,
    )) as RawFeatureRow[]
    return rows.map(rawToRow)
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
    return toRow(entity)
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
    this.em.remove(entity)
    await this.em.flush()
    return true
  }

  async deleteDescendants(id: string) {
    const rows = (await this.em.getConnection().execute(
      `WITH RECURSIVE tree AS (
        SELECT f._id FROM feature f WHERE f.parent__id = ?
        UNION ALL
        SELECT f._id FROM feature f JOIN tree t ON f.parent__id = t._id
      )
      SELECT _id FROM tree`,
      [id],
    )) as Array<{ _id: string }>
    if (rows.length === 0) {
      return 0
    }
    const allIds = rows.map((r) => r._id)
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
    const rows = (await this.em.getConnection().execute(
      `SELECT * FROM feature WHERE ref_seq__id IN (${placeholders(refSeqIds.length)})`,
      refSeqIds,
    )) as RawFeatureRow[]
    const matchingIds = new Set<string>()
    for (const row of rows) {
      const text = row.type + ' ' + (row.attributes ?? '{}')
      const textTokens = tokenize(text)
      if (matchesPhrase(textTokens, queryTokens)) {
        matchingIds.add(row._id)
      }
    }
    if (matchingIds.size === 0) {
      return []
    }
    const parentMap = new Map<string, string | undefined>()
    for (const row of rows) {
      parentMap.set(row._id, row.parent__id ?? undefined)
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
    return rows
      .filter((row) => rootIds.has(row._id) && row.parent__id == null)
      .map(rawToRow)
  }

  async activateByUser(user: string) {
    return this.em.nativeUpdate(
      FeatureEntity,
      { status: -1, user },
      { status: 0 },
    )
  }

  async findByIndexedId(id: string, refSeqIds?: string[]) {
    let sql = 'SELECT * FROM feature WHERE parent__id IS NULL'
    const params: unknown[] = []
    if (refSeqIds && refSeqIds.length > 0) {
      sql += ` AND ref_seq__id IN (${placeholders(refSeqIds.length)})`
      for (const rsId of refSeqIds) {
        params.push(rsId)
      }
    }
    const roots = (await this.em.getConnection().execute(sql, params)) as RawFeatureRow[]
    const allFeatures = (await this.em.getConnection().execute(
      'SELECT _id, parent__id, attributes FROM feature',
    )) as Array<{
      _id: string
      parent__id: string | null
      attributes: string | null
    }>

    const childrenMap = new Map<string, string[]>()
    for (const f of allFeatures) {
      if (f.parent__id) {
        const children = childrenMap.get(f.parent__id)
        if (children) {
          children.push(f._id)
        } else {
          childrenMap.set(f.parent__id, [f._id])
        }
      }
    }
    const attrMap = new Map<string, string | null>()
    for (const f of allFeatures) {
      attrMap.set(f._id, f.attributes)
    }

    const results: FeatureRow[] = []
    for (const root of roots) {
      if (this.treeContainsIndexedIdInMemory(root._id, id, childrenMap, attrMap)) {
        results.push(rawToRow(root))
      }
    }
    return results
  }

  private treeContainsIndexedIdInMemory(
    nodeId: string,
    id: string,
    childrenMap: Map<string, string[]>,
    attrMap: Map<string, string | null>,
  ): boolean {
    const attrStr = attrMap.get(nodeId)
    if (attrStr) {
      const attributes = JSON.parse(attrStr) as Record<string, string[]>
      for (const values of Object.values(attributes)) {
        if (values.includes(id)) {
          return true
        }
      }
    }
    const children = childrenMap.get(nodeId)
    if (children) {
      for (const childId of children) {
        if (this.treeContainsIndexedIdInMemory(childId, id, childrenMap, attrMap)) {
          return true
        }
      }
    }
    return false
  }

  async findRootParent(id: string) {
    const rows = (await this.em.getConnection().execute(
      `WITH RECURSIVE ancestors AS (
        SELECT * FROM feature WHERE _id = ?
        UNION ALL
        SELECT f.* FROM feature f JOIN ancestors a ON f._id = a.parent__id
      )
      SELECT * FROM ancestors WHERE parent__id IS NULL`,
      [id],
    )) as RawFeatureRow[]
    if (rows.length > 0) {
      return rawToRow(rows[0]!)
    }
    return undefined
  }
}
