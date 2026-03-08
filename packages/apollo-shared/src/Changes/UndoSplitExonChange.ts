/* eslint-disable @typescript-eslint/require-await */

import {
  type ChangeOptions,
  type ClientDataStore,
  FeatureChange,
  type SerializedFeatureChange,
  type ServerDataStore,
} from '@apollo-annotation/common'
import type { AnnotationFeatureSnapshot } from '@apollo-annotation/mst'

import { flattenFeatureSnapshot } from './AddFeatureChange.js'
import { SplitExonChange } from './SplitExonChange.js'

interface SerializedUndoSplitExonChangeBase extends SerializedFeatureChange {
  typeName: 'UndoSplitExonChange'
}

export interface UndoSplitExonChangeDetails {
  exonToRestore: AnnotationFeatureSnapshot
  parentFeatureId: string
  idsToDelete: string[]
  upstreamCut: number
  downstreamCut: number
  leftExonId: string
  rightExonId: string
}

interface SerializedUndoSplitExonChangeSingle
  extends SerializedUndoSplitExonChangeBase,
    UndoSplitExonChangeDetails {}

interface SerializedUndoSplitExonChangeMultiple
  extends SerializedUndoSplitExonChangeBase {
  changes: UndoSplitExonChangeDetails[]
}

export type SerializedUndoSplitExonChange =
  | SerializedUndoSplitExonChangeSingle
  | SerializedUndoSplitExonChangeMultiple
export class UndoSplitExonChange extends FeatureChange {
  typeName = 'UndoSplitExonChange' as const
  changes: UndoSplitExonChangeDetails[]

  constructor(json: SerializedUndoSplitExonChange, options?: ChangeOptions) {
    super(json, options)
    this.changes = 'changes' in json ? json.changes : [json]
  }

  toJSON(): SerializedUndoSplitExonChange {
    const { assembly, changedIds, changes, typeName } = this
    if (changes.length === 1) {
      const [
        {
          exonToRestore,
          parentFeatureId,
          idsToDelete,
          upstreamCut,
          downstreamCut,
          leftExonId,
          rightExonId,
        },
      ] = changes

      return {
        typeName,
        changedIds,
        assembly,
        exonToRestore,
        parentFeatureId,
        idsToDelete,
        upstreamCut,
        downstreamCut,
        leftExonId,
        rightExonId,
      }
    }
    return { typeName, changedIds, assembly, changes }
  }

  async executeOnServer(backend: ServerDataStore) {
    const { featureRepository } = backend
    const { changes } = this
    for (const change of changes) {
      const { exonToRestore, parentFeatureId, idsToDelete } = change
      const parentRow = await featureRepository.findById(parentFeatureId)
      if (!parentRow) {
        throw new Error(`Could not find feature with ID "${parentFeatureId}"`)
      }
      const rows = flattenFeatureSnapshot(
        exonToRestore,
        parentRow.refSeq,
        parentFeatureId,
      )
      await featureRepository.createMany(rows)
      for (const id of idsToDelete) {
        await featureRepository.deleteDescendants(id)
        await featureRepository.deleteById(id)
      }
    }
  }
  async executeOnClient(dataStore: ClientDataStore) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!dataStore) {
      throw new Error('No data store')
    }
    const { changes } = this
    for (const change of changes) {
      const { exonToRestore, parentFeatureId, idsToDelete } = change
      if (!parentFeatureId) {
        throw new Error('Parent ID is missing')
      }
      const parentFeature = dataStore.getFeature(parentFeatureId)
      if (!parentFeature) {
        throw new Error(`Could not find parent feature "${parentFeatureId}"`)
      }
      // create an ID for the parent feature if it does not have one
      if (!parentFeature.attributes.get('_id')) {
        parentFeature.setAttribute('_id', [parentFeature._id])
      }
      parentFeature.addChild(exonToRestore)
      idsToDelete.map((id) => {
        parentFeature.deleteChild(id)
      })
    }
  }

  getInverse() {
    const { assembly, changedIds, changes, logger } = this
    const inverseChangedIds = [...changedIds].reverse()
    const inverseChanges = [...changes]
      .reverse()
      .map((undoSplitExonChange) => ({
        parentFeatureId: undoSplitExonChange.parentFeatureId,
        exonToBeSplit: undoSplitExonChange.exonToRestore,
        upstreamCut: undoSplitExonChange.upstreamCut,
        downstreamCut: undoSplitExonChange.downstreamCut,
        leftExonId: undoSplitExonChange.leftExonId,
        rightExonId: undoSplitExonChange.rightExonId,
      }))

    return new SplitExonChange(
      {
        changedIds: inverseChangedIds,
        typeName: 'SplitExonChange',
        changes: inverseChanges,
        assembly,
      },
      { logger },
    )
  }
}
