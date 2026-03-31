import type { FeatureRow } from '@apollo-annotation/common'

import { FeatureEntity } from '../entities/FeatureEntity.js'

import {
  BaseFeatureRepository,
  STOP_WORDS,
  matchesPhrase,
  tokenize,
} from './BaseFeatureRepository.js'

// Shape returned by raw SQL — snake_case DB column names
interface RawFeatureRow {
  _id: string
  parent__id: string | null
  assembly__id: string
  ref_seq: string
  type: string
  min: number
  max: number
  strand: number | null
  phase: number | null
  attributes: string | null
  user: string | null
  created_at: string | null
  updated_at: string | null
}

function rawToRow(raw: RawFeatureRow): FeatureRow {
  return {
    _id: raw._id,
    parentId: raw.parent__id ?? undefined,
    assembly: raw.assembly__id,
    refSeq: raw.ref_seq,
    type: raw.type,
    min: raw.min,
    max: raw.max,
    strand: (raw.strand ?? undefined) as 1 | -1 | undefined,
    phase: (raw.phase ?? undefined) as 0 | 1 | 2 | undefined,
    attributes: raw.attributes
      ? (JSON.parse(raw.attributes) as Record<string, string[]>)
      : undefined,
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
    const ctx = this.em.getTransactionContext()
    return this.em.getConnection().execute(query, params, 'all', ctx)
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

  // Raw SQL required: recursive CTE to collect all descendant IDs for deletion.
  // Entities are loaded and removed through the UoW so that the
  // FeatureHistorySubscriber records each deletion.
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
    const entities = await this.em.find(FeatureEntity, { _id: { $in: allIds } })
    for (const entity of entities) {
      this.em.remove(entity)
    }
    await this.em.flush()
    return entities.length
  }

  // Raw SQL required: LIKE on computed expression (type || attributes) and
  // recursive CTE to walk from matching features up to their root parents
  async searchText(assemblyId: string, query: string) {
    const queryTokens = tokenize(query).filter((t) => !STOP_WORDS.has(t))
    if (queryTokens.length === 0) {
      return []
    }

    const likeConditions = queryTokens.map(
      () =>
        `(LOWER(type) || ' ' || COALESCE(LOWER(CAST(attributes AS TEXT)), '')) LIKE ?`,
    )
    const likeParams = queryTokens.map((t) => `%${t}%`)

    const candidateRows = (await this.sql(
      `SELECT * FROM feature
       WHERE assembly__id = ?
       AND ${likeConditions.join(' AND ')}`,
      [assemblyId, ...likeParams],
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
  async findByIndexedId(id: string, assemblyId?: string) {
    const escapedId = id
      .replaceAll('%', String.raw`\%`)
      .replaceAll('_', String.raw`\_`)
    const likePattern = `%"${escapedId}"%`

    let matchSql = `SELECT _id FROM feature WHERE CAST(attributes AS TEXT) LIKE ?`
    const params: unknown[] = [likePattern]
    if (assemblyId) {
      matchSql += ` AND assembly__id = ?`
      params.push(assemblyId)
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
    const roots = await this.findRootParentsOfMany([id])
    return roots[0]
  }

  // Raw SQL required: recursive CTE to walk parent chains up to roots for
  // multiple features in a single query
  async findRootParentsOfMany(ids: string[]) {
    if (ids.length === 0) {
      return []
    }
    const rows = (await this.sql(
      `WITH RECURSIVE ancestors AS (
        SELECT * FROM feature WHERE _id IN (${placeholders(ids.length)})
        UNION ALL
        SELECT f.* FROM feature f JOIN ancestors a ON f._id = a.parent__id
      )
      SELECT DISTINCT * FROM ancestors WHERE parent__id IS NULL`,
      ids,
    )) as RawFeatureRow[]
    return rows.map((r) => rawToRow(r))
  }
}
