/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import {
  type ChangeOptions,
  type ClientDataStore,
  FeatureChange,
  type SerializedFeatureChange,
  type ServerDataStore,
} from '@apollo-annotation/common'
import type { AnnotationFeatureSnapshot } from '@apollo-annotation/mst'

import { AddFeatureChange } from './AddFeatureChange.js'

interface SerializedDeleteFeatureChangeBase extends SerializedFeatureChange {
  typeName: 'DeleteFeatureChange'
}

export interface DeleteFeatureChangeDetails {
  deletedFeature: AnnotationFeatureSnapshot
  parentFeatureId?: string // Parent feature from where feature was deleted.
}

interface SerializedDeleteFeatureChangeSingle
  extends SerializedDeleteFeatureChangeBase, DeleteFeatureChangeDetails {}

interface SerializedDeleteFeatureChangeMultiple extends SerializedDeleteFeatureChangeBase {
  changes: DeleteFeatureChangeDetails[]
}

export type SerializedDeleteFeatureChange =
  | SerializedDeleteFeatureChangeSingle
  | SerializedDeleteFeatureChangeMultiple

export class DeleteFeatureChange extends FeatureChange {
  typeName = 'DeleteFeatureChange' as const
  changes: DeleteFeatureChangeDetails[]

  constructor(json: SerializedDeleteFeatureChange, options?: ChangeOptions) {
    super(json, options)
    this.changes = 'changes' in json ? json.changes : [json]
  }
  // eslint-disable-next-line @typescript-eslint/class-literal-property-style
  get notification() {
    return 'Feature deleted successfully'
  }

  toJSON(): SerializedDeleteFeatureChange {
    const { assembly, changedIds, changes, typeName } = this
    if (changes.length === 1) {
      const [{ deletedFeature, parentFeatureId }] = changes
      return { typeName, changedIds, assembly, deletedFeature, parentFeatureId }
    }
    return { typeName, changedIds, assembly, changes }
  }

  async executeOnServer(backend: ServerDataStore) {
    const { changes, logger } = this
    for (const change of changes) {
      const { deletedFeature } = change
      const row = await backend.featureRepository.findById(deletedFeature._id)
      if (!row) {
        const errMsg = `Feature not found: ${deletedFeature._id}`
        logger.error(errMsg)
        throw new Error(errMsg)
      }
      await backend.featureRepository.deleteDescendants(deletedFeature._id)
      await backend.featureRepository.deleteById(deletedFeature._id)
    }
  }
  async executeOnClient(dataStore: ClientDataStore) {
    if (!dataStore) {
      throw new Error('No data store')
    }
    for (const change of this.changes) {
      const { deletedFeature, parentFeatureId } = change
      if (parentFeatureId) {
        const parentFeature = dataStore.getFeature(parentFeatureId)
        if (!parentFeature) {
          throw new Error(`Could not find parent feature "${parentFeatureId}"`)
        }
        parentFeature.deleteChild(deletedFeature._id)
      } else {
        if (dataStore.getFeature(deletedFeature._id)) {
          dataStore.deleteFeature(deletedFeature._id)
        }
      }
    }
  }

  getInverse() {
    const { assembly, changedIds, changes, logger } = this
    const inverseChangedIds = [...changedIds].reverse()
    const inverseChanges = [...changes]
      .reverse()
      .map((deleteFeatureChange) => ({
        addedFeature: deleteFeatureChange.deletedFeature,
        parentFeatureId: deleteFeatureChange.parentFeatureId,
      }))
    logger.debug?.(`INVERSE CHANGE '${JSON.stringify(inverseChanges)}'`)
    return new AddFeatureChange(
      {
        changedIds: inverseChangedIds,
        typeName: 'AddFeatureChange',
        changes: inverseChanges,
        assembly,
      },
      { logger },
    )
  }
}

export function isDeleteFeatureChange(
  change: unknown,
): change is DeleteFeatureChange {
  return (change as DeleteFeatureChange).typeName === 'DeleteFeatureChange'
}
