/* eslint-disable unicorn/prefer-structured-clone */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import {
  type ChangeOptions,
  type ClientDataStore,
  FeatureChange,
  type FeatureRow,
  type SerializedFeatureChange,
  type ServerDataStore,
} from '@apollo-annotation/common'
import type {
  AnnotationFeature,
  AnnotationFeatureSnapshot,
} from '@apollo-annotation/mst'
import { doesIntersect2 } from '@jbrowse/core/util'
import { cast, getSnapshot } from '@jbrowse/mobx-state-tree'

import { attributesToRecords, stringifyAttributes } from '../util.js'

import { flattenFeatureSnapshot } from './AddFeatureChange.js'
import { UndoMergeTranscriptsChange } from './UndoMergeTranscriptsChange.js'

interface SerializedMergeTranscriptsChangeBase extends SerializedFeatureChange {
  typeName: 'MergeTranscriptsChange'
}

export interface MergeTranscriptsChangeDetails {
  firstTranscript: AnnotationFeatureSnapshot
  secondTranscript: AnnotationFeatureSnapshot
  parentFeatureId: string
}

interface SerializedMergeTranscriptsChangeSingle
  extends SerializedMergeTranscriptsChangeBase,
    MergeTranscriptsChangeDetails {}

interface SerializedMergeTranscriptsChangeMultiple
  extends SerializedMergeTranscriptsChangeBase {
  changes: MergeTranscriptsChangeDetails[]
}

export type SerializedMergeTranscriptsChange =
  | SerializedMergeTranscriptsChangeSingle
  | SerializedMergeTranscriptsChangeMultiple

export class MergeTranscriptsChange extends FeatureChange {
  typeName = 'MergeTranscriptsChange' as const
  changes: MergeTranscriptsChangeDetails[]

  constructor(json: SerializedMergeTranscriptsChange, options?: ChangeOptions) {
    super(json, options)
    this.changes = 'changes' in json ? json.changes : [json]
  }
  // eslint-disable-next-line @typescript-eslint/class-literal-property-style
  get notification() {
    return 'Transcripts successfully merged'
  }

  toJSON(): SerializedMergeTranscriptsChange {
    const { assembly, changedIds, changes, typeName } = this
    if (changes.length === 1) {
      const [{ firstTranscript, secondTranscript, parentFeatureId }] = changes

      return {
        typeName,
        changedIds,
        assembly,
        firstTranscript,
        secondTranscript,
        parentFeatureId,
      }
    }
    return { typeName, changedIds, assembly, changes }
  }

  async executeOnServer(backend: ServerDataStore) {
    const { featureRepository } = backend
    const { changes, logger } = this
    for (const change of changes) {
      const { firstTranscript, secondTranscript } = change
      const firstRow = await featureRepository.findById(firstTranscript._id)
      if (!firstRow) {
        const errMsg = `Feature not found: ${firstTranscript._id}`
        logger.error(errMsg)
        throw new Error(errMsg)
      }
      const mergedAttributes: Record<string, string[]> = firstRow.attributes
        ? JSON.parse(JSON.stringify(firstRow.attributes))
        : {}
      if (secondTranscript.attributes) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        const existing = mergedAttributes.merged_with ?? []
        existing.push(
          stringifyAttributes(attributesToRecords(secondTranscript.attributes)),
        )
        mergedAttributes.merged_with = existing
      }
      await featureRepository.updateById(firstTranscript._id, {
        min: Math.min(firstRow.min, secondTranscript.min),
        max: Math.max(firstRow.max, secondTranscript.max),
        attributes: mergedAttributes,
      })

      if (secondTranscript.children) {
        for (const secondChild of Object.values(secondTranscript.children)) {
          await this.mergeFeatureIntoTranscript(
            secondChild,
            firstTranscript._id,
            firstRow.refSeq,
            featureRepository,
          )
        }
      }

      // Delete the second transcript row only (children were reparented)
      await featureRepository.deleteById(secondTranscript._id)
    }
  }

  private async mergeFeatureIntoTranscript(
    secondChild: AnnotationFeatureSnapshot,
    firstTranscriptId: string,
    refSeq: string,
    featureRepository: ServerDataStore['featureRepository'],
  ) {
    const firstChildren =
      await featureRepository.findChildren(firstTranscriptId)
    let merged = false
    let mrgChild: FeatureRow | undefined
    let toDelete: FeatureRow | undefined

    for (const firstChild of firstChildren) {
      if (!merged || !mrgChild) {
        toDelete = undefined
        mrgChild = firstChild
      } else {
        toDelete = firstChild
      }
      if (
        mrgChild.type === secondChild.type &&
        mrgChild.type === firstChild.type &&
        doesIntersect2(
          secondChild.min,
          secondChild.max,
          mrgChild.min,
          mrgChild.max,
        ) &&
        doesIntersect2(
          firstChild.min,
          firstChild.max,
          mrgChild.min,
          mrgChild.max,
        )
      ) {
        const newMin = Math.min(secondChild.min, mrgChild.min, firstChild.min)
        const newMax = Math.max(secondChild.max, mrgChild.max, firstChild.max)

        const mrgChildAttr: Record<string, string[]> = mrgChild.attributes
          ? JSON.parse(JSON.stringify(mrgChild.attributes))
          : {}
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        const existingMergedWith = mrgChildAttr.merged_with ?? []
        existingMergedWith.push(
          stringifyAttributes(attributesToRecords(secondChild.attributes)),
        )

        if (toDelete) {
          const recs: Record<string, string[] | undefined> = toDelete.attributes
            ? JSON.parse(JSON.stringify(toDelete.attributes))
            : undefined
          existingMergedWith.push(stringifyAttributes(recs))
          // Reparent toDelete's children to mrgChild
          const grandchildren = await featureRepository.findChildren(
            toDelete._id,
          )
          for (const gc of grandchildren) {
            await featureRepository.updateById(gc._id, {
              parentId: mrgChild._id,
            })
          }
          await featureRepository.deleteById(toDelete._id)
        }

        mrgChildAttr.merged_with = [...new Set(existingMergedWith)]
        await featureRepository.updateById(mrgChild._id, {
          min: newMin,
          max: newMax,
          attributes: mrgChildAttr,
        })
        merged = true
      }
    }

    if (merged && mrgChild && secondChild.children) {
      for (const child of Object.values(secondChild.children)) {
        await featureRepository.deleteDescendants(child._id)
        await featureRepository.deleteById(child._id)
        const rows = flattenFeatureSnapshot(child, refSeq, mrgChild._id)
        await featureRepository.createMany(rows)
      }
    }

    if (!merged) {
      await featureRepository.deleteDescendants(secondChild._id)
      await featureRepository.deleteById(secondChild._id)
      const rows = flattenFeatureSnapshot(
        secondChild,
        refSeq,
        firstTranscriptId,
      )
      await featureRepository.createMany(rows)
    }
  }

  /* --------------------------------- */

  async executeOnClient(dataStore: ClientDataStore) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!dataStore) {
      throw new Error('No data store')
    }
    for (const [idx, changedId] of this.changedIds.entries()) {
      const { firstTranscript, secondTranscript } = this.changes[idx]
      const mergedTranscript = dataStore.getFeature(firstTranscript._id)
      if (!mergedTranscript) {
        throw new Error(`Could not find feature with identifier "${changedId}"`)
      }
      this.mergeTranscriptsOnClient(mergedTranscript, secondTranscript)
      mergedTranscript.parent?.deleteChild(secondTranscript._id)
    }
  }

  mergeTranscriptsOnClient(
    firstTranscript: AnnotationFeature,
    secondTranscript: AnnotationFeatureSnapshot,
  ) {
    firstTranscript.setMin(Math.min(firstTranscript.min, secondTranscript.min))
    firstTranscript.setMax(Math.max(firstTranscript.max, secondTranscript.max))

    const mrg = firstTranscript.attributes.get('merged_with')?.slice() ?? []
    const mergedWith = stringifyAttributes(
      attributesToRecords(secondTranscript.attributes),
    )

    if (!mrg.includes(mergedWith)) {
      // executeOnClient runs twice (?!) so avoid adding this key again
      mrg.push(mergedWith)
    }
    firstTranscript.setAttribute('merged_with', mrg)

    if (secondTranscript.children) {
      for (const [, secondFeatureChild] of Object.entries(
        secondTranscript.children,
      )) {
        this.mergeFeatureIntoTranscriptOnClient(
          secondFeatureChild,
          firstTranscript,
        )
      }
    }
  }

  mergeFeatureIntoTranscriptOnClient(
    secondFeatureChild: AnnotationFeatureSnapshot,
    firstTranscript: AnnotationFeature,
  ) {
    if (!firstTranscript.children) {
      firstTranscript.children = cast({})
    }
    const { children } = firstTranscript
    if (!children) {
      return
    }
    let merged = false
    let mrgChild: AnnotationFeature | undefined
    let toDelete
    for (const [, firstFeatureChild] of children) {
      if (!merged || !mrgChild) {
        toDelete = false
        mrgChild = firstFeatureChild
      } else {
        toDelete = true
      }
      if (
        mrgChild!.type === secondFeatureChild.type &&
        mrgChild!.type === firstFeatureChild.type &&
        doesIntersect2(
          secondFeatureChild.min,
          secondFeatureChild.max,
          mrgChild!.min,
          mrgChild!.max,
        ) &&
        doesIntersect2(
          firstFeatureChild.min,
          firstFeatureChild.max,
          mrgChild!.min,
          mrgChild!.max,
        )
      ) {
        mrgChild!.setMin(
          Math.min(secondFeatureChild.min, mrgChild!.min, firstFeatureChild.min),
        )
        mrgChild!.setMax(
          Math.max(secondFeatureChild.max, mrgChild!.max, firstFeatureChild.max),
        )

        const mergedWithAttributes =
          mrgChild!.attributes.get('merged_with')?.slice() ?? []
        mergedWithAttributes.push(
          stringifyAttributes(
            attributesToRecords(secondFeatureChild.attributes),
          ),
        )
        if (toDelete) {
          const snap = getSnapshot<AnnotationFeatureSnapshot>(firstFeatureChild)
          mergedWithAttributes.push(
            stringifyAttributes(snap.attributes),
          )
          firstTranscript.deleteChild(firstFeatureChild._id)
        }
        mrgChild!.setAttribute('merged_with', [...new Set(mergedWithAttributes)])
        merged = true
      }
    }

    if (merged && mrgChild && secondFeatureChild.children) {
      Object.entries(secondFeatureChild.children).map(([, child]) => {
        mrgChild.addChild(child)
      })
    }

    if (merged && mrgChild) {
      firstTranscript.addChild(getSnapshot(mrgChild))
    } else {
      // This secondFeatureChild has no overlap with any feature in the
      // receiving transcript so we add it as it is to the receiving transcript
      firstTranscript.addChild(secondFeatureChild)
    }
  }
  getInverse() {
    const { assembly, changedIds, changes, logger } = this
    const inverseChangedIds = [...changedIds].reverse()
    const inverseChanges = [...changes]
      .reverse()
      .map((mergeTranscriptChange) => ({
        transcriptsToRestore: [
          mergeTranscriptChange.firstTranscript,
          mergeTranscriptChange.secondTranscript,
        ],
        parentFeatureId: mergeTranscriptChange.parentFeatureId,
      }))
    logger.debug?.(`INVERSE CHANGE '${JSON.stringify(inverseChanges)}'`)
    return new UndoMergeTranscriptsChange(
      {
        changedIds: inverseChangedIds,
        typeName: 'UndoMergeTranscriptsChange',
        changes: inverseChanges,
        assembly,
      },
      { logger },
    )
  }
}
