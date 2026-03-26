/* eslint-disable @typescript-eslint/require-await */

import {
  type ChangeOptions,
  type ClientDataStore,
  FeatureChange,
  type SerializedFeatureChange,
  type ServerDataStore,
} from '@apollo-annotation/common'
import type {
  AnnotationFeatureSnapshot,
  Children,
} from '@apollo-annotation/mst'

import { flattenFeatureSnapshot } from './AddFeatureChange.js'
import { UndoSplitTranscriptChange } from './UndoSplitTranscriptChange.js'

interface SerializedSplitTranscriptChangeBase extends SerializedFeatureChange {
  typeName: 'SplitTranscriptChange'
}

export interface SplitTranscriptChangeDetails {
  transcriptToSplit: AnnotationFeatureSnapshot
  parentFeatureId: string
  splitPoint: number
  leftTranscriptId: string
  rightTranscriptId: string
}

interface SerializedSplitTranscriptChangeSingle
  extends SerializedSplitTranscriptChangeBase, SplitTranscriptChangeDetails {}

interface SerializedSplitTranscriptChangeMultiple extends SerializedSplitTranscriptChangeBase {
  changes: SplitTranscriptChangeDetails[]
}

export type SerializedSplitTranscriptChange =
  | SerializedSplitTranscriptChangeSingle
  | SerializedSplitTranscriptChangeMultiple

export class SplitTranscriptChange extends FeatureChange {
  typeName = 'SplitTranscriptChange' as const
  changes: SplitTranscriptChangeDetails[]

  constructor(json: SerializedSplitTranscriptChange, options?: ChangeOptions) {
    super(json, options)
    this.changes = 'changes' in json ? json.changes : [json]
  }

  // eslint-disable-next-line @typescript-eslint/class-literal-property-style
  get notification() {
    return 'Transcript successfully split'
  }

  toJSON(): SerializedSplitTranscriptChange {
    const { assembly, changedIds, changes, typeName } = this
    if (changes.length === 1) {
      const [
        {
          transcriptToSplit,
          parentFeatureId,
          splitPoint,
          leftTranscriptId,
          rightTranscriptId,
        },
      ] = changes

      return {
        typeName,
        changedIds,
        assembly,
        transcriptToSplit,
        parentFeatureId,
        splitPoint,
        leftTranscriptId,
        rightTranscriptId,
      }
    }
    return { typeName, changedIds, assembly, changes }
  }

  makeSplitTranscripts(
    transcript: AnnotationFeatureSnapshot,
    splitPoint: number,
    leftTranscriptId: string,
    rightTranscriptId: string,
  ): [AnnotationFeatureSnapshot, AnnotationFeatureSnapshot] {
    const leftChildren: Record<string, AnnotationFeatureSnapshot> = {}
    const rightChildren: Record<string, AnnotationFeatureSnapshot> = {}

    if (transcript.children) {
      for (const [id, child] of Object.entries(transcript.children)) {
        const childMidpoint = (child.min + child.max) / 2
        if (childMidpoint <= splitPoint) {
          leftChildren[id] = child
        } else {
          rightChildren[id] = child
        }
      }
    }

    let leftMin = transcript.min
    let leftMax = splitPoint
    let rightMin = splitPoint
    let rightMax = transcript.max

    const leftChildValues = Object.values(leftChildren)
    if (leftChildValues.length > 0) {
      leftMin = Math.min(...leftChildValues.map((c) => c.min))
      leftMax = Math.max(...leftChildValues.map((c) => c.max))
    }
    const rightChildValues = Object.values(rightChildren)
    if (rightChildValues.length > 0) {
      rightMin = Math.min(...rightChildValues.map((c) => c.min))
      rightMax = Math.max(...rightChildValues.map((c) => c.max))
    }

    const leftTranscript: AnnotationFeatureSnapshot = {
      ...transcript,
      _id: leftTranscriptId,
      min: leftMin,
      max: leftMax,
      children: Object.keys(leftChildren).length > 0 ? leftChildren : undefined,
    }

    const rightTranscript: AnnotationFeatureSnapshot = {
      ...transcript,
      _id: rightTranscriptId,
      min: rightMin,
      max: rightMax,
      children:
        Object.keys(rightChildren).length > 0 ? rightChildren : undefined,
    }

    // Remove gff_id and gff_name from both new transcripts to avoid duplicates
    if (leftTranscript.attributes) {
      const attrs = { ...leftTranscript.attributes }
      delete attrs.gff_id
      delete attrs.gff_name
      leftTranscript.attributes = attrs
    }
    if (rightTranscript.attributes) {
      const attrs = { ...rightTranscript.attributes }
      delete attrs.gff_id
      delete attrs.gff_name
      rightTranscript.attributes = attrs
    }

    return [leftTranscript, rightTranscript]
  }

  async executeOnServer(backend: ServerDataStore) {
    const { featureRepository } = backend
    const { changes, logger } = this
    for (const change of changes) {
      const {
        transcriptToSplit,
        parentFeatureId,
        splitPoint,
        leftTranscriptId,
        rightTranscriptId,
      } = change
      const parentRow = await featureRepository.findById(parentFeatureId)
      if (!parentRow) {
        const errMsg = `Feature not found: ${parentFeatureId}`
        logger.error(errMsg)
        throw new Error(errMsg)
      }

      const [leftTranscript, rightTranscript] = this.makeSplitTranscripts(
        transcriptToSplit,
        splitPoint,
        leftTranscriptId,
        rightTranscriptId,
      )

      const leftRows = flattenFeatureSnapshot(
        leftTranscript,
        parentRow.refSeq,
        parentFeatureId,
      )
      const rightRows = flattenFeatureSnapshot(
        rightTranscript,
        parentRow.refSeq,
        parentFeatureId,
      )
      await featureRepository.createMany([...leftRows, ...rightRows])
      await featureRepository.deleteDescendants(transcriptToSplit._id)
      await featureRepository.deleteById(transcriptToSplit._id)

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

    for (const [idx] of this.changedIds.entries()) {
      const {
        transcriptToSplit,
        parentFeatureId,
        splitPoint,
        leftTranscriptId,
        rightTranscriptId,
      } = this.changes[idx]

      if (!parentFeatureId) {
        throw new Error('Splitting a transcript without parent is not possible')
      }

      const [leftTranscript, rightTranscript] = this.makeSplitTranscripts(
        transcriptToSplit,
        splitPoint,
        leftTranscriptId,
        rightTranscriptId,
      )

      const parentFeature = dataStore.getFeature(parentFeatureId)
      if (!parentFeature) {
        throw new Error(`Could not find parent feature "${parentFeatureId}"`)
      }

      parentFeature.addChild(leftTranscript)
      parentFeature.addChild(rightTranscript)
      if (dataStore.getFeature(transcriptToSplit._id)) {
        dataStore.deleteFeature(transcriptToSplit._id)
      }

      // Update parent gene bounds
      const parentChildren = parentFeature.children as Children
      if (parentChildren) {
        let newMin = Infinity
        let newMax = -Infinity
        for (const [, child] of parentChildren) {
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
    const inverseChanges = [...changes].reverse().map((change) => ({
      transcriptToRestore: change.transcriptToSplit,
      parentFeatureId: change.parentFeatureId,
      idsToDelete: [change.leftTranscriptId, change.rightTranscriptId],
    }))
    logger.debug?.(`INVERSE CHANGE '${JSON.stringify(inverseChanges)}'`)
    return new UndoSplitTranscriptChange(
      {
        changedIds: inverseChangedIds,
        typeName: 'UndoSplitTranscriptChange',
        changes: inverseChanges,
        assembly,
      },
      { logger },
    )
  }
}
