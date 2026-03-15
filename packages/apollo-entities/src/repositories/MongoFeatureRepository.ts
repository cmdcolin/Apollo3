import type { FeatureRow } from '@apollo-annotation/common'
import type { InferEntity } from '@mikro-orm/core'

import { FeatureEntity } from '../entities/FeatureEntity.js'

import {
  BaseFeatureRepository,
  STOP_WORDS,
  entityToRow,
  matchesPhrase,
  tokenize,
} from './BaseFeatureRepository.js'

/**
 * MongoDB-compatible feature repository using iterative BFS for tree
 * traversal instead of recursive CTEs. Uses only the generic EntityManager
 * API from @mikro-orm/core, so it works with any MikroORM driver.
 */
export class MongoFeatureRepository extends BaseFeatureRepository {
  async findDescendants(rootId: string) {
    return this.findDescendantsOfMany([rootId])
  }

  // Iterative BFS: walk tree level by level using em.find()
  async findDescendantsOfMany(rootIds: string[]) {
    if (rootIds.length === 0) {
      return []
    }
    const allDescendants: FeatureRow[] = []
    let currentParentIds = rootIds
    while (currentParentIds.length > 0) {
      const children = await this.em.find(FeatureEntity, {
        parent: { $in: currentParentIds },
      })
      if (children.length === 0) {
        break
      }
      const rows = children.map((e) => entityToRow(e))
      for (const row of rows) {
        allDescendants.push(row)
      }
      currentParentIds = children.map((e) => e._id)
    }
    return allDescendants
  }

  // Iterative BFS to collect descendant IDs, then bulk delete
  async deleteDescendants(id: string) {
    const allIds: string[] = []
    let currentParentIds = [id]
    while (currentParentIds.length > 0) {
      const children = await this.em.find(FeatureEntity, {
        parent: { $in: currentParentIds },
      }, { fields: ['_id'] })
      if (children.length === 0) {
        break
      }
      const childIds = children.map((e) => e._id)
      for (const childId of childIds) {
        allIds.push(childId)
      }
      currentParentIds = childIds
    }
    if (allIds.length === 0) {
      return 0
    }
    return this.em.nativeDelete(FeatureEntity, { _id: { $in: allIds } })
  }

  // Text search: load features for the given refSeqs and filter in JS
  async searchText(refSeqIds: string[], query: string) {
    if (refSeqIds.length === 0) {
      return []
    }
    const queryTokens = tokenize(query).filter((t) => !STOP_WORDS.has(t))
    if (queryTokens.length === 0) {
      return []
    }

    const entities = await this.em.find(FeatureEntity, {
      refSeq: { $in: refSeqIds },
    })

    const matchingIds: string[] = []
    const parentMap = new Map<string, string | undefined>()
    for (const entity of entities) {
      parentMap.set(entity._id, entity.parent?._id ?? undefined)
      const text = `${entity.type} ${JSON.stringify(entity.attributes ?? {})}`
      const textTokens = tokenize(text)
      if (matchesPhrase(textTokens, queryTokens)) {
        matchingIds.push(entity._id)
      }
    }

    if (matchingIds.length === 0) {
      return []
    }

    // Walk up to root parents using the in-memory parent map
    const rootIds = new Set<string>()
    for (const matchId of matchingIds) {
      let current = matchId
      while (parentMap.get(current) !== undefined) {
        current = parentMap.get(current)!
      }
      rootIds.add(current)
    }

    const rootEntities = await this.em.find(FeatureEntity, {
      _id: { $in: [...rootIds] },
    })
    return rootEntities.map((e) => entityToRow(e))
  }

  // Search for features by indexed ID in attributes, then walk up to root parents
  async findByIndexedId(id: string, refSeqIds?: string[]) {
    const filter: Record<string, unknown> = {}
    if (refSeqIds && refSeqIds.length > 0) {
      filter.refSeq = { $in: refSeqIds }
    }

    const entities = await this.em.find(FeatureEntity, filter)

    const verifiedIds: string[] = []
    const parentMap = new Map<string, string | undefined>()
    for (const entity of entities) {
      parentMap.set(entity._id, entity.parent?._id ?? undefined)
      if (entity.attributes) {
        for (const values of Object.values(entity.attributes)) {
          if (values.includes(id)) {
            verifiedIds.push(entity._id)
            break
          }
        }
      }
    }

    if (verifiedIds.length === 0) {
      return []
    }

    // Walk up to root parents
    const rootIds = new Set<string>()
    for (const matchId of verifiedIds) {
      let current = matchId
      while (parentMap.get(current) !== undefined) {
        current = parentMap.get(current)!
      }
      rootIds.add(current)
    }

    const rootEntities = await this.em.find(FeatureEntity, {
      _id: { $in: [...rootIds] },
    })
    return rootEntities.map((e) => entityToRow(e))
  }

  // Walk up the parent chain iteratively to find the root
  async findRootParent(id: string) {
    const roots = await this.findRootParentsOfMany([id])
    return roots[0]
  }

  // Walk parent chains upward in batches to find root ancestors.
  // Each iteration loads the next level of parents for all unresolved
  // features at once, so the total number of queries equals tree depth
  // (typically 3-4), not the number of input IDs.
  async findRootParentsOfMany(ids: string[]) {
    if (ids.length === 0) {
      return []
    }
    const resolved = new Map<string, InferEntity<typeof FeatureEntity>>()
    let currentIds = ids
    while (currentIds.length > 0) {
      const entities = await this.em.find(FeatureEntity, {
        _id: { $in: currentIds },
      })
      const nextParentIds: string[] = []
      for (const entity of entities) {
        if (entity.parent?._id) {
          nextParentIds.push(entity.parent._id)
        } else {
          resolved.set(entity._id, entity)
        }
      }
      currentIds = nextParentIds
    }
    return [...resolved.values()].map((e) => entityToRow(e))
  }
}
