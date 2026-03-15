import type { FeatureRow } from '@apollo-annotation/common'

import { FeatureEntity } from '../entities/FeatureEntity.js'
import {
  BaseFeatureRepository,
  STOP_WORDS,
  entityToRow,
  matchesPhrase,
  tokenize,
} from './BaseFeatureRepository.js'

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

function placeholders(count: number) {
  return Array.from({ length: count }, () => '?').join(', ')
}

/**
 * SQL-optimized feature repository using recursive CTEs for tree traversal.
 * Works with SQLite and PostgreSQL.
 */
export class MikroOrmFeatureRepository extends BaseFeatureRepository {
  private sql(query: string, params?: unknown[]) {
    return this.em.getConnection().execute(query, params, 'all')
  }

  async findDescendants(rootId: string) {
    return this.findDescendantsOfMany([rootId])
  }

  // Raw SQL required: recursive CTE for tree traversal cannot be expressed
  // with MikroORM's filter operators
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

  // Raw SQL required: recursive CTE to collect all descendant IDs for deletion
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

  // Raw SQL required: LIKE on computed expression (type || attributes) and
  // recursive CTE to walk from matching features up to their root parents
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
      () => `(LOWER(type) || ' ' || COALESCE(LOWER(CAST(attributes AS TEXT)), '')) LIKE ?`,
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

  // Raw SQL required: LIKE on JSON attributes column for substring matching,
  // then recursive CTE to walk from matches up to root parents
  async findByIndexedId(id: string, refSeqIds?: string[]) {
    const escapedId = id.replace(/%/g, '\\%').replace(/_/g, '\\_')
    const likePattern = `%"${escapedId}"%`

    let matchSql = `SELECT _id FROM feature WHERE CAST(attributes AS TEXT) LIKE ?`
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
      const entities = await this.em.find(
        FeatureEntity,
        { _id: { $in: matchRows.map((r) => r._id) } },
        { fields: ['_id', 'attributes'] },
      )
      for (const entity of entities) {
        if (entity.attributes) {
          for (const values of Object.values(entity.attributes)) {
            if (values.includes(id)) {
              verifiedIds.push(entity._id)
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

  // Raw SQL required: recursive CTE to walk parent chain up to root
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
