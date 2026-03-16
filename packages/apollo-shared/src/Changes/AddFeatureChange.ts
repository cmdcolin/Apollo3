/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import {
  type ChangeOptions,
  type ClientDataStore,
  FeatureChange,
  type FeatureRow,
  type SerializedFeatureChange,
  type ServerDataStore,
} from '@apollo-annotation/common'
import type { AnnotationFeatureSnapshot } from '@apollo-annotation/mst'

import { DeleteFeatureChange } from './DeleteFeatureChange.js'

interface SerializedAddFeatureChangeBase extends SerializedFeatureChange {
  typeName: 'AddFeatureChange'
}

export interface AddFeatureChangeDetails {
  addedFeature: AnnotationFeatureSnapshot
  parentFeatureId?: string // Parent feature to where feature will be added
  copyFeature?: boolean // Are we copying or adding a new child feature
}

interface SerializedAddFeatureChangeSingle
  extends SerializedAddFeatureChangeBase, AddFeatureChangeDetails {}

interface SerializedAddFeatureChangeMultiple extends SerializedAddFeatureChangeBase {
  changes: AddFeatureChangeDetails[]
}

export type SerializedAddFeatureChange =
  | SerializedAddFeatureChangeSingle
  | SerializedAddFeatureChangeMultiple

export class AddFeatureChange extends FeatureChange {
  typeName = 'AddFeatureChange' as const
  changes: AddFeatureChangeDetails[]

  constructor(json: SerializedAddFeatureChange, options?: ChangeOptions) {
    super(json, options)
    this.changes = 'changes' in json ? json.changes : [json]
  }
  // eslint-disable-next-line @typescript-eslint/class-literal-property-style
  get notification() {
    return 'Feature added successfully'
  }

  toJSON(): SerializedAddFeatureChange {
    const { assembly, changedIds, changes, typeName } = this
    if (changes.length === 1) {
      const [{ addedFeature, copyFeature, parentFeatureId }] = changes
      return {
        typeName,
        changedIds,
        assembly,
        addedFeature,
        parentFeatureId,
        copyFeature,
      }
    }
    return { typeName, changedIds, assembly, changes }
  }

  async executeOnServer(backend: ServerDataStore) {
    const { changes, logger } = this

    for (const change of changes) {
      const { addedFeature, copyFeature, parentFeatureId } = change
      const rows = flattenFeatureSnapshot(addedFeature, addedFeature.refSeq)

      if (parentFeatureId && rows.length > 0) {
        rows[0].parentId = parentFeatureId
      }
      await backend.featureRepository.createMany(rows)
    }
    logger.debug?.('Added features')
  }
  async executeOnClient(dataStore: ClientDataStore) {
    if (!dataStore) {
      throw new Error('No data store')
    }
    const { assembly, changes } = this
    for (const change of changes) {
      const { addedFeature, parentFeatureId } = change
      if (parentFeatureId) {
        let parentFeature = dataStore.getFeature(parentFeatureId)
        // maybe the parent feature hasn't been loaded yet
        if (!parentFeature) {
          await dataStore.loadFeatures([
            {
              assemblyName: assembly,
              refName: addedFeature.refSeq,
              start: addedFeature.min,
              end: addedFeature.max,
            },
          ])
          parentFeature = dataStore.getFeature(parentFeatureId)
          if (!parentFeature) {
            throw new Error(
              `Could not find parent feature "${parentFeatureId}"`,
            )
          }
        }
        // create an ID for the parent feature if it does not have one
        if (!parentFeature.attributes.get('_id')) {
          parentFeature.setAttribute('_id', [parentFeature._id])
        }
        parentFeature.addChild(addedFeature)
      } else {
        dataStore.addFeature(assembly, addedFeature)
      }
    }
  }

  getInverse() {
    const { assembly, changedIds, changes, logger } = this
    const inverseChangedIds = [...changedIds].reverse()
    const inverseChanges = [...changes].reverse().map((addFeatureChange) => ({
      deletedFeature: addFeatureChange.addedFeature,
      parentFeatureId: addFeatureChange.parentFeatureId,
    }))

    return new DeleteFeatureChange(
      {
        changedIds: inverseChangedIds,
        typeName: 'DeleteFeatureChange',
        changes: inverseChanges,
        assembly,
      },
      { logger },
    )
  }
}

export function isAddFeatureChange(
  change: unknown,
): change is AddFeatureChange {
  return (change as AddFeatureChange).typeName === 'AddFeatureChange'
}

export function flattenFeatureSnapshot(
  snapshot: AnnotationFeatureSnapshot,
  refSeq: string,
  parentId?: string,
) {
  const rows: FeatureRow[] = []
  const row: FeatureRow = {
    _id: snapshot._id,
    refSeq,
    parentId,
    type: snapshot.type,
    min: snapshot.min,
    max: snapshot.max,
    strand: snapshot.strand,
    attributes: snapshot.attributes as Record<string, string[]> | undefined,
  }
  rows.push(row)
  if (snapshot.children) {
    for (const child of Object.values(snapshot.children)) {
      const childRows = flattenFeatureSnapshot(child, refSeq, snapshot._id)
      for (const cr of childRows) {
        rows.push(cr)
      }
    }
  }
  return rows
}
