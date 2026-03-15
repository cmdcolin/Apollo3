/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import {
  type ChangeOptions,
  type ClientDataStore,
  FeatureChange,
  type SerializedFeatureChange,
  type ServerDataStore,
} from '@apollo-annotation/common'
import type { AnnotationFeatureSnapshot } from '@apollo-annotation/mst'

import { flattenFeatureSnapshot } from './AddFeatureChange.js'
import { UndoSplitExonChange } from './UndoSplitExonChange.js'

interface SerializedSplitExonChangeBase extends SerializedFeatureChange {
  typeName: 'SplitExonChange'
}

export interface SplitExonChangeDetails {
  exonToBeSplit: AnnotationFeatureSnapshot
  parentFeatureId: string
  upstreamCut: number
  downstreamCut: number
  leftExonId: string
  rightExonId: string
}

interface SerializedSplitExonChangeSingle
  extends SerializedSplitExonChangeBase, SplitExonChangeDetails {}

interface SerializedSplitExonChangeMultiple extends SerializedSplitExonChangeBase {
  changes: SplitExonChangeDetails[]
}

export type SerializedSplitExonChange =
  | SerializedSplitExonChangeSingle
  | SerializedSplitExonChangeMultiple
export class SplitExonChange extends FeatureChange {
  typeName = 'SplitExonChange' as const
  changes: SplitExonChangeDetails[]

  constructor(json: SerializedSplitExonChange, options?: ChangeOptions) {
    super(json, options)
    this.changes = 'changes' in json ? json.changes : [json]
  }
  // eslint-disable-next-line @typescript-eslint/class-literal-property-style
  get notification() {
    return 'Exon successfully split'
  }

  toJSON(): SerializedSplitExonChange {
    const { assembly, changedIds, changes, typeName } = this
    if (changes.length === 1) {
      const [
        {
          exonToBeSplit,
          parentFeatureId,
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
        exonToBeSplit,
        parentFeatureId,
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
    const { changes, logger } = this
    for (const change of changes) {
      const {
        exonToBeSplit,
        parentFeatureId,
        upstreamCut,
        downstreamCut,
        leftExonId,
        rightExonId,
      } = change
      const parentRow = await featureRepository.findById(parentFeatureId)
      if (!parentRow) {
        const errMsg = `Feature not found: ${parentFeatureId}`
        logger.error(errMsg)
        throw new Error(errMsg)
      }
      const [leftExon, rightExon] = this.makeSplitExons(
        exonToBeSplit,
        upstreamCut,
        downstreamCut,
        leftExonId,
        rightExonId,
      )
      const leftRows = flattenFeatureSnapshot(
        leftExon,
        parentRow.refSeq,
        parentFeatureId,
      )
      const rightRows = flattenFeatureSnapshot(
        rightExon,
        parentRow.refSeq,
        parentFeatureId,
      )
      await featureRepository.createMany([...leftRows, ...rightRows])
      await featureRepository.deleteDescendants(exonToBeSplit._id)
      await featureRepository.deleteById(exonToBeSplit._id)
    }
  }
  async executeOnClient(dataStore: ClientDataStore) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!dataStore) {
      throw new Error('No data store')
    }

    for (const [idx] of this.changedIds.entries()) {
      const {
        exonToBeSplit,
        parentFeatureId,
        upstreamCut,
        downstreamCut,
        leftExonId,
        rightExonId,
      } = this.changes[idx]
      if (!parentFeatureId) {
        throw new Error('TODO: Split exon without parent')
      }

      const [leftExon, rightExon] = this.makeSplitExons(
        exonToBeSplit,
        upstreamCut,
        downstreamCut,
        leftExonId,
        rightExonId,
      )

      const parentFeature = dataStore.getFeature(parentFeatureId)
      if (!parentFeature) {
        throw new Error(`Could not find parent feature "${parentFeatureId}"`)
      }

      parentFeature.addChild(leftExon)
      parentFeature.addChild(rightExon)
      if (dataStore.getFeature(exonToBeSplit._id)) {
        dataStore.deleteFeature(exonToBeSplit._id)
      }
    }
  }

  getInverse() {
    const { assembly, changedIds, changes, logger } = this
    const inverseChangedIds = [...changedIds].reverse()
    const inverseChanges = [...changes].reverse().map((splitExonChange) => ({
      exonToRestore: splitExonChange.exonToBeSplit,
      parentFeatureId: splitExonChange.parentFeatureId,
      idsToDelete: [splitExonChange.leftExonId, splitExonChange.rightExonId],
      upstreamCut: splitExonChange.upstreamCut,
      downstreamCut: splitExonChange.downstreamCut,
      leftExonId: splitExonChange.leftExonId,
      rightExonId: splitExonChange.rightExonId,
    }))
    logger.debug?.(`INVERSE CHANGE '${JSON.stringify(inverseChanges)}'`)
    return new UndoSplitExonChange(
      {
        changedIds: inverseChangedIds,
        typeName: 'UndoSplitExonChange',
        changes: inverseChanges,
        assembly,
      },
      { logger },
    )
  }

  makeSplitExons(
    exonToBeSplit: AnnotationFeatureSnapshot,
    upstreamCut: number,
    downstreamCut: number,
    leftExonId: string,
    rightExonId: string,
  ): AnnotationFeatureSnapshot[] {
    // eslint-disable-next-line unicorn/prefer-structured-clone
    const exon = JSON.parse(JSON.stringify(exonToBeSplit))
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    delete exon.attributes._id
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    delete exon.attributes.gff_id

    const leftExon = structuredClone(
      exon,
    ) as unknown as AnnotationFeatureSnapshot
    leftExon._id = leftExonId
    leftExon.max = upstreamCut

    const rightExon = structuredClone(
      exon,
    ) as unknown as AnnotationFeatureSnapshot
    rightExon.min = downstreamCut
    rightExon._id = rightExonId

    return [leftExon, rightExon]
  }
}
