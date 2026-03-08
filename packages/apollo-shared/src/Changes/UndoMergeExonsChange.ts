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
import { MergeExonsChange } from './MergeExonsChange.js'

interface SerializedUndoMergeExonsChangeBase extends SerializedFeatureChange {
  typeName: 'UndoMergeExonsChange'
}

export interface UndoMergeExonsChangeDetails {
  exonsToRestore: AnnotationFeatureSnapshot[]
  parentFeatureId: string
}

interface SerializedUndoMergeExonsChangeSingle
  extends SerializedUndoMergeExonsChangeBase,
    UndoMergeExonsChangeDetails {}

interface SerializedUndoMergeExonsChangeMultiple
  extends SerializedUndoMergeExonsChangeBase {
  changes: UndoMergeExonsChangeDetails[]
}

export type SerializedUndoMergeExonsChange =
  | SerializedUndoMergeExonsChangeSingle
  | SerializedUndoMergeExonsChangeMultiple
export class UndoMergeExonsChange extends FeatureChange {
  typeName = 'UndoMergeExonsChange' as const
  changes: UndoMergeExonsChangeDetails[]

  constructor(json: SerializedUndoMergeExonsChange, options?: ChangeOptions) {
    super(json, options)
    this.changes = 'changes' in json ? json.changes : [json]
  }

  toJSON(): SerializedUndoMergeExonsChange {
    const { assembly, changedIds, changes, typeName } = this
    if (changes.length === 1) {
      const [{ exonsToRestore, parentFeatureId }] = changes

      return {
        typeName,
        changedIds,
        assembly,
        exonsToRestore,
        parentFeatureId,
      }
    }
    return { typeName, changedIds, assembly, changes }
  }

  async executeOnServer(backend: ServerDataStore) {
    const { featureRepository } = backend
    const { changes } = this
    for (const change of changes) {
      const { exonsToRestore, parentFeatureId } = change
      if (exonsToRestore.length !== 2) {
        throw new Error(
          `Expected exactly two exons to restore. Got: ${exonsToRestore.length}`,
        )
      }
      const parentRow = await featureRepository.findById(parentFeatureId)
      if (!parentRow) {
        throw new Error(`Could not find feature with ID "${parentFeatureId}"`)
      }
      // Delete the merged exon (first exon's ID) and its descendants
      await featureRepository.deleteDescendants(exonsToRestore[0]._id)
      await featureRepository.deleteById(exonsToRestore[0]._id)
      // Re-create both original exons
      for (const exon of exonsToRestore) {
        const rows = flattenFeatureSnapshot(
          exon,
          parentRow.refSeq,
          parentFeatureId,
        )
        await featureRepository.createMany(rows)
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
      const { exonsToRestore, parentFeatureId } = change
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
      for (const exon of exonsToRestore) {
        parentFeature.addChild(exon)
      }
    }
  }

  getInverse() {
    const { assembly, changedIds, changes, logger } = this
    const inverseChangedIds = [...changedIds].reverse()
    const inverseChanges = [...changes]
      .reverse()
      .map((undoMergeExonsChange) => ({
        firstExon: undoMergeExonsChange.exonsToRestore[0],
        secondExon: undoMergeExonsChange.exonsToRestore[1],
        parentFeatureId: undoMergeExonsChange.parentFeatureId,
      }))

    return new MergeExonsChange(
      {
        changedIds: inverseChangedIds,
        typeName: 'MergeExonsChange',
        changes: inverseChanges,
        assembly,
      },
      { logger },
    )
  }
}
