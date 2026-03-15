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
import { SplitTranscriptChange } from './SplitTranscriptChange.js'

interface SerializedUndoSplitTranscriptChangeBase extends SerializedFeatureChange {
  typeName: 'UndoSplitTranscriptChange'
}

export interface UndoSplitTranscriptChangeDetails {
  transcriptToRestore: AnnotationFeatureSnapshot
  parentFeatureId: string
  idsToDelete: string[]
}

interface SerializedUndoSplitTranscriptChangeSingle
  extends
    SerializedUndoSplitTranscriptChangeBase,
    UndoSplitTranscriptChangeDetails {}

interface SerializedUndoSplitTranscriptChangeMultiple extends SerializedUndoSplitTranscriptChangeBase {
  changes: UndoSplitTranscriptChangeDetails[]
}

export type SerializedUndoSplitTranscriptChange =
  | SerializedUndoSplitTranscriptChangeSingle
  | SerializedUndoSplitTranscriptChangeMultiple

export class UndoSplitTranscriptChange extends FeatureChange {
  typeName = 'UndoSplitTranscriptChange' as const
  changes: UndoSplitTranscriptChangeDetails[]

  constructor(
    json: SerializedUndoSplitTranscriptChange,
    options?: ChangeOptions,
  ) {
    super(json, options)
    this.changes = 'changes' in json ? json.changes : [json]
  }

  toJSON(): SerializedUndoSplitTranscriptChange {
    const { assembly, changedIds, changes, typeName } = this
    if (changes.length === 1) {
      const [{ transcriptToRestore, parentFeatureId, idsToDelete }] = changes

      return {
        typeName,
        changedIds,
        assembly,
        transcriptToRestore,
        parentFeatureId,
        idsToDelete,
      }
    }
    return { typeName, changedIds, assembly, changes }
  }

  async executeOnServer(backend: ServerDataStore) {
    const { featureRepository } = backend
    const { changes } = this
    for (const change of changes) {
      const { transcriptToRestore, parentFeatureId, idsToDelete } = change
      const parentRow = await featureRepository.findById(parentFeatureId)
      if (!parentRow) {
        throw new Error(`Could not find feature with ID "${parentFeatureId}"`)
      }
      // Restore original transcript
      const rows = flattenFeatureSnapshot(
        transcriptToRestore,
        parentRow.refSeq,
        parentFeatureId,
      )
      await featureRepository.createMany(rows)
      // Delete split transcripts
      for (const id of idsToDelete) {
        await featureRepository.deleteDescendants(id)
        await featureRepository.deleteById(id)
      }
      // Update parent gene bounds
      const siblings = await featureRepository.findChildren(parentFeatureId)
      if (siblings.length > 0) {
        const newMin = Math.min(...siblings.map((s) => s.min))
        const newMax = Math.max(...siblings.map((s) => s.max))
        await featureRepository.updateById(parentFeatureId, {
          min: newMin,
          max: newMax,
        })
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
      const { transcriptToRestore, parentFeatureId, idsToDelete } = change
      if (!parentFeatureId) {
        throw new Error('Parent ID is missing')
      }
      const parentFeature = dataStore.getFeature(parentFeatureId)
      if (!parentFeature) {
        throw new Error(`Could not find parent feature "${parentFeatureId}"`)
      }
      parentFeature.addChild(transcriptToRestore)
      for (const id of idsToDelete) {
        parentFeature.deleteChild(id)
      }
      // Update parent gene bounds
      if (parentFeature.children) {
        let newMin = Infinity
        let newMax = -Infinity
        for (const [, child] of parentFeature.children) {
          if (child.min < newMin) {
            newMin = child.min
          }
          if (child.max > newMax) {
            newMax = child.max
          }
        }
        parentFeature.setMin(newMin)
        parentFeature.setMax(newMax)
      }
    }
  }

  getInverse() {
    const { assembly, changedIds, changes, logger } = this
    const inverseChangedIds = [...changedIds].reverse()
    const inverseChanges = [...changes].reverse().map((change) => {
      const children = change.transcriptToRestore.children
      if (!children) {
        throw new Error('Transcript has no children to determine split point')
      }
      const childValues = Object.values(children)
      // Use midpoint of sorted children as the split point
      const sorted = [...childValues].sort((a, b) => a.min - b.min)
      const mid = Math.floor(sorted.length / 2)
      const splitPoint = (sorted[mid - 1].max + sorted[mid].min) / 2

      return {
        transcriptToSplit: change.transcriptToRestore,
        parentFeatureId: change.parentFeatureId,
        splitPoint,
        leftTranscriptId: change.idsToDelete[0],
        rightTranscriptId: change.idsToDelete[1],
      }
    })

    return new SplitTranscriptChange(
      {
        changedIds: inverseChangedIds,
        typeName: 'SplitTranscriptChange',
        changes: inverseChanges,
        assembly,
      },
      { logger },
    )
  }
}
