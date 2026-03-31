import { historyId } from '@apollo-annotation/common'
import {
  ChangeSetType,
  type EntityManager,
  type EventSubscriber,
  type FlushEventArgs,
  type InferEntity,
} from '@mikro-orm/core'

import { mutationContext } from '../MutationContext.js'
import type { FeatureEntity } from '../entities/FeatureEntity.js'
import { FeatureHistoryEntity } from '../entities/FeatureHistoryEntity.js'

type FeatureEntityInstance = InferEntity<typeof FeatureEntity>

function getAssemblyId(entity: { assembly: string | { _id: string } }) {
  return typeof entity.assembly === 'string'
    ? entity.assembly
    : entity.assembly._id
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
  const ctx = mutationContext.getStore()
  const record = em.create(FeatureHistoryEntity, {
    _id: historyId(),
    featureId: entity._id,
    assembly: getAssemblyId(entity),
    refSeq: entity.refSeq,
    parentId: getParentId(entity),
    type: entity.type,
    min: entity.min,
    max: entity.max,
    strand: entity.strand ?? null,
    phase: entity.phase ?? null,
    attributes: entity.attributes ?? null,
    changeType,
    changedBy: ctx?.user ?? entity.user ?? null,
    changedAt: new Date(),
    sequence: ctx?.sequence ?? null,
  })
  em.persist(record)
  return record
}

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
