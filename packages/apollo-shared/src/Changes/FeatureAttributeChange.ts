/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import {
  type ChangeOptions,
  type ClientDataStore,
  FeatureChange,
  type SerializedFeatureChange,
  type ServerDataStore,
} from '@apollo-annotation/common'

interface SerializedFeatureAttributeChangeBase extends SerializedFeatureChange {
  typeName: 'FeatureAttributeChange'
}

export interface FeatureAttributeChangeDetails {
  featureId: string
  oldAttributes: Record<string, string[]>
  newAttributes: Record<string, string[]>
}

interface SerializedFeatureAttributeChangeSingle
  extends SerializedFeatureAttributeChangeBase,
    FeatureAttributeChangeDetails {}

interface SerializedFeatureAttributeChangeMultiple
  extends SerializedFeatureAttributeChangeBase {
  changes: FeatureAttributeChangeDetails[]
}

export type SerializedFeatureAttributeChange =
  | SerializedFeatureAttributeChangeSingle
  | SerializedFeatureAttributeChangeMultiple

export class FeatureAttributeChange extends FeatureChange {
  typeName = 'FeatureAttributeChange' as const
  changes: FeatureAttributeChangeDetails[]

  constructor(json: SerializedFeatureAttributeChange, options?: ChangeOptions) {
    super(json, options)
    this.changes = 'changes' in json ? json.changes : [json]
  }

  toJSON(): SerializedFeatureAttributeChange {
    const { assembly, changedIds, changes, typeName } = this
    if (changes.length === 1) {
      const [{ oldAttributes, newAttributes, featureId }] = changes
      return {
        typeName,
        changedIds,
        assembly,
        featureId,
        oldAttributes,
        newAttributes,
      }
    }
    return { typeName, changedIds, assembly, changes }
  }

  async executeOnServer(backend: ServerDataStore) {
    const { featureRepository } = backend
    const { changes, logger } = this
    for (const change of changes) {
      const { featureId, newAttributes } = change
      const row = await featureRepository.findById(featureId)
      if (!row) {
        const errMsg = `Feature not found: ${featureId}`
        logger.error(errMsg)
        throw new Error(errMsg)
      }
      await featureRepository.updateById(featureId, {
        attributes: newAttributes,
      })
    }
  }
  async executeOnClient(dataStore: ClientDataStore) {
    if (!dataStore) {
      throw new Error('No data store')
    }
    for (const [idx, changedId] of this.changedIds.entries()) {
      const feature = dataStore.getFeature(changedId)
      if (!feature) {
        throw new Error(`Could not find feature with identifier "${changedId}"`)
      }
      feature.setAttributes(
        new Map(Object.entries(this.changes[idx].newAttributes)),
      )
    }
  }

  getInverse() {
    const { assembly, changedIds, changes, logger } = this
    const inverseChangedIds = [...changedIds].reverse()
    const inverseChanges = [...changes].reverse().map((oneChange) => ({
      featureId: oneChange.featureId,
      oldAttributes: oneChange.newAttributes,
      newAttributes: oneChange.oldAttributes,
    }))
    return new FeatureAttributeChange(
      {
        changedIds: inverseChangedIds,
        typeName: 'FeatureAttributeChange',
        changes: inverseChanges,
        assembly,
      },
      { logger },
    )
  }
}

export function isFeatureAttributeChange(
  change: unknown,
): change is FeatureAttributeChange {
  return (
    (change as FeatureAttributeChange).typeName === 'FeatureAttributeChange'
  )
}
