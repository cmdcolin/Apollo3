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

// Shape returned by raw SQL — snake_case DB column names
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

function entityToRow(entity: InferEntity<typeof FeatureEntity>): FeatureRow {
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

  private sql(query: string, params?: unknown[]) {
    return this.em.getConnection().execute(query, params, 'all')
  }

  async findAll() {
    const rows = (await this.sql('SELECT * FROM feature')) as RawFeatureRow[]
    return rows.map((r) => rawToRow(r))
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
    const rows = (await this.sql(
      'SELECT * FROM feature WHERE _id = ?',
      [id],
    )) as RawFeatureRow[]
    const [first] = rows
    if (first) {
      return rawToRow(first)
    }
    return
  }

  async findByIds(ids: string[]) {
    if (ids.length === 0) {
      return []
    }
    const rows = (await this.sql(
      `SELECT * FROM feature WHERE _id IN (${placeholders(ids.length)})`,
      ids,
    )) as RawFeatureRow[]
    return rows.map((r) => rawToRow(r))
  }

  async findByRange(refSeqId: string, start: number, end: number) {
    const rows = (await this.sql(
      'SELECT * FROM feature WHERE ref_seq__id = ? AND min <= ? AND max >= ?',
      [refSeqId, end, start],
    )) as RawFeatureRow[]
    return rows.map((r) => rawToRow(r))
  }

  async findRootsByRange(refSeqId: string, start: number, end: number) {
    const rows = (await this.sql(
      'SELECT * FROM feature WHERE ref_seq__id = ? AND parent__id IS NULL AND min <= ? AND max >= ?',
      [refSeqId, end, start],
    )) as RawFeatureRow[]
    return rows.map((r) => rawToRow(r))
  }

  async findChildren(parentId: string) {
    const rows = (await this.sql(
      'SELECT * FROM feature WHERE parent__id = ?',
      [parentId],
    )) as RawFeatureRow[]
    return rows.map((r) => rawToRow(r))
  }

  async findDescendants(rootId: string) {
    return this.findDescendantsOfMany([rootId])
  }

  async findDescendantsOfMany(rootIds: string[]) {
    if (rootIds.length === 0) {
      return []
    }
    const rows = (await this.sql(
      `WITH RECURSIVE tree AS (
        SELECT f.* FROM feature f WHERE f.parent__id IN (${placeholders(rootIds.length)})
        UNION ALL
        SELECT f.* FROM feature f JOIN tree t ON f.parent__id = t._id
      )
      SELECT * FROM tree`,
      rootIds,
    )) as RawFeatureRow[]
    return rows.map((r) => rawToRow(r))
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

  async deleteDescendants(id: string) {
    const rows = (await this.sql(
      `WITH RECURSIVE tree AS (
        SELECT f._id FROM feature f WHERE f.parent__id = ?
        UNION ALL
        SELECT f._id FROM feature f JOIN tree t ON f.parent__id = t._id
      )
      SELECT _id FROM tree`,
      [id],
    )) as { _id: string }[]
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
    const queryTokens = tokenize(query).filter((t) => !STOP_WORDS.has(t))
    if (queryTokens.length === 0) {
      return []
    }

    // Use SQL LIKE to pre-filter candidates, then precise phrase matching in JS
    const refSeqPh = placeholders(refSeqIds.length)
    const likeConditions = queryTokens.map(
      () => `(LOWER(type) || ' ' || COALESCE(LOWER(attributes), '')) LIKE ?`,
    )
    const likeParams = queryTokens.map((t) => `%${t}%`)

    const candidateRows = (await this.sql(
      `SELECT * FROM feature
       WHERE ref_seq__id IN (${refSeqPh})
       AND ${likeConditions.join(' AND ')}`,
      [...refSeqIds, ...likeParams],
    )) as RawFeatureRow[]

    // Precise phrase matching on the small candidate set
    const matchingIds: string[] = []
    for (const row of candidateRows) {
      const text = `${row.type} ${row.attributes ?? '{}'}`
      const textTokens = tokenize(text)
      if (matchesPhrase(textTokens, queryTokens)) {
        matchingIds.push(row._id)
      }
    }
    if (matchingIds.length === 0) {
      return []
    }

    // Walk up to root parents using recursive CTE
    const rows = (await this.sql(
      `WITH RECURSIVE ancestors AS (
        SELECT f.* FROM feature f WHERE f._id IN (${placeholders(matchingIds.length)})
        UNION ALL
        SELECT f.* FROM feature f JOIN ancestors a ON f._id = a.parent__id
      )
      SELECT DISTINCT * FROM ancestors WHERE parent__id IS NULL`,
      matchingIds,
    )) as RawFeatureRow[]
    return rows.map((r) => rawToRow(r))
  }

  async activateByUser(user: string) {
    return this.em.nativeUpdate(
      FeatureEntity,
      { status: -1, user },
      { status: 0 },
    )
  }

  async findByIndexedId(id: string, refSeqIds?: string[]) {
    // Use SQL LIKE to find features whose attributes JSON contains the id,
    // then walk up to root parents using recursive CTE
    const escapedId = id.replace(/%/g, '\\%').replace(/_/g, '\\_')
    const likePattern = `%"${escapedId}"%`

    let matchSql = `SELECT _id FROM feature WHERE attributes LIKE ?`
    const params: unknown[] = [likePattern]
    if (refSeqIds && refSeqIds.length > 0) {
      matchSql += ` AND ref_seq__id IN (${placeholders(refSeqIds.length)})`
      for (const rsId of refSeqIds) {
        params.push(rsId)
      }
    }

    const matchRows = (await this.sql(matchSql, params)) as { _id: string }[]

    // Verify matches precisely (LIKE may produce false positives for substring matches)
    const verifiedIds: string[] = []
    if (matchRows.length > 0) {
      const fullRows = (await this.sql(
        `SELECT _id, attributes FROM feature WHERE _id IN (${placeholders(matchRows.length)})`,
        matchRows.map((r) => r._id),
      )) as { _id: string; attributes: string | null }[]
      for (const row of fullRows) {
        if (row.attributes) {
          const attributes = JSON.parse(row.attributes) as Record<
            string,
            string[]
          >
          for (const values of Object.values(attributes)) {
            if (values.includes(id)) {
              verifiedIds.push(row._id)
              break
            }
          }
        }
      }
    }

    if (verifiedIds.length === 0) {
      return []
    }

    // Walk up to root parents
    const rows = (await this.sql(
      `WITH RECURSIVE ancestors AS (
        SELECT f.* FROM feature f WHERE f._id IN (${placeholders(verifiedIds.length)})
        UNION ALL
        SELECT f.* FROM feature f JOIN ancestors a ON f._id = a.parent__id
      )
      SELECT DISTINCT * FROM ancestors WHERE parent__id IS NULL`,
      verifiedIds,
    )) as RawFeatureRow[]
    return rows.map((r) => rawToRow(r))
  }

  async findRootParent(id: string) {
    const rows = (await this.sql(
      `WITH RECURSIVE ancestors AS (
        SELECT * FROM feature WHERE _id = ?
        UNION ALL
        SELECT f.* FROM feature f JOIN ancestors a ON f._id = a.parent__id
      )
      SELECT * FROM ancestors WHERE parent__id IS NULL`,
      [id],
    )) as RawFeatureRow[]
    const [first] = rows
    if (first) {
      return rawToRow(first)
    }
    return
  }
}
