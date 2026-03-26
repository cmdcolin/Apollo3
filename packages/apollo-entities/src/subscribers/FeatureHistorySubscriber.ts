import { historyId } from '@apollo-annotation/common'
import {
  type EntityManager,
  type EventSubscriber,
  type FlushEventArgs,
  type InferEntity,
  ChangeSetType,
} from '@mikro-orm/core'

import type { FeatureEntity } from '../entities/FeatureEntity.js'
import { FeatureHistoryEntity } from '../entities/FeatureHistoryEntity.js'

type FeatureEntityInstance = InferEntity<typeof FeatureEntity>

function getRefSeqId(entity: { refSeq: string | { _id: string } }) {
  return typeof entity.refSeq === 'string' ? entity.refSeq : entity.refSeq._id
}

function getParentId(entity: {
  parent?: string | { _id: string } | null | undefined
}) {
  if (!entity.parent) {
    return null
  }
  return typeof entity.parent === 'string'
    ? entity.parent
    : entity.parent._id
}

function recordFromEntity(
  em: EntityManager,
  entity: FeatureEntityInstance,
  changeType: 'insert' | 'update' | 'delete',
) {
  const record = em.create(FeatureHistoryEntity, {
    _id: historyId(),
    featureId: entity._id,
    refSeq: getRefSeqId(entity),
    parentId: getParentId(entity),
    type: entity.type,
    min: entity.min,
    max: entity.max,
    strand: entity.strand ?? null,
    phase: entity.phase ?? null,
    attributes: entity.attributes ?? null,
    changeType,
    changedBy: entity.user ?? null,
    changedAt: new Date(),
    sequence: null,
  })
  em.persist(record)
  return record
}

export function createHistoryRecord(
  em: EntityManager,
  entity: {
    _id: string
    refSeq: string
    parentId: string | null
    type: string
    min: number
    max: number
    strand: number | null
    phase: number | null
    attributes: Record<string, string[]> | null
  },
  changeType: 'insert' | 'update' | 'delete',
  changedBy: string | null,
  sequence: number | null,
) {
  const record = em.create(FeatureHistoryEntity, {
    _id: historyId(),
    featureId: entity._id,
    refSeq: entity.refSeq,
    parentId: entity.parentId,
    type: entity.type,
    min: entity.min,
    max: entity.max,
    strand: entity.strand,
    phase: entity.phase,
    attributes: entity.attributes,
    changeType,
    changedBy,
    changedAt: new Date(),
    sequence,
  })
  em.persist(record)
  return record
}

// Captures feature state on create/update/delete via MikroORM unit of work.
// Uses onFlush to inspect all pending changeSets and create history records
// that are included in the same flush (and thus the same transaction).
//
// Bulk operations (em.insertMany, em.nativeDelete) bypass the UoW and must
// record history explicitly using createHistoryRecord().
export class FeatureHistorySubscriber implements EventSubscriber {
  onFlush(args: FlushEventArgs) {
    const { uow } = args

    for (const cs of uow.getChangeSets()) {
      if (cs.meta.tableName !== 'feature') {
        continue
      }
      const entity = cs.entity as FeatureEntityInstance
      switch (cs.type) {
        case ChangeSetType.CREATE: {
          uow.computeChangeSet(recordFromEntity(args.em, entity, 'insert'))
          break
        }
        case ChangeSetType.UPDATE: {
          // originalEntity contains the full pre-update snapshot from when the
          // entity was loaded into the identity map. We record that state.
          const original = cs.originalEntity as FeatureEntityInstance
          uow.computeChangeSet(recordFromEntity(args.em, original, 'update'))
          break
        }
        case ChangeSetType.DELETE: {
          uow.computeChangeSet(recordFromEntity(args.em, entity, 'delete'))
          break
        }
      }
    }
  }
}
