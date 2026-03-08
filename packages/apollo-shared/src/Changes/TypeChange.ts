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

interface SerializedTypeChangeBase extends SerializedFeatureChange {
  typeName: 'TypeChange'
}

interface TypeChangeDetails {
  featureId: string
  oldType: string
  newType: string
}

interface SerializedTypeChangeSingle
  extends SerializedTypeChangeBase,
    TypeChangeDetails {}

interface SerializedTypeChangeMultiple extends SerializedTypeChangeBase {
  changes: TypeChangeDetails[]
}

export type SerializedTypeChange =
  | SerializedTypeChangeSingle
  | SerializedTypeChangeMultiple

export class TypeChange extends FeatureChange {
  typeName = 'TypeChange' as const
  changes: TypeChangeDetails[]

  constructor(json: SerializedTypeChange, options?: ChangeOptions) {
    super(json, options)
    this.changes = 'changes' in json ? json.changes : [json]
  }

  toJSON(): SerializedTypeChange {
    const { assembly, changedIds, changes, typeName } = this
    if (changes.length === 1) {
      const [{ featureId, newType, oldType }] = changes
      return { typeName, changedIds, assembly, featureId, oldType, newType }
    }
    return { typeName, changedIds, assembly, changes }
  }

  async executeOnServer(backend: ServerDataStore) {
    const { featureRepository } = backend
    const { changes, logger } = this
    for (const change of changes) {
      const { featureId, oldType, newType } = change
      const row = await featureRepository.findById(featureId)
      if (!row) {
        const errMsg = `Feature not found: ${featureId}`
        logger.error(errMsg)
        throw new Error(errMsg)
      }
      if (row.type !== oldType) {
        const errMsg = `Feature's current type "${row.type}" doesn't match with expected value "${oldType}"`
        logger.error(errMsg)
        throw new Error(errMsg)
      }
      await featureRepository.updateById(featureId, { type: newType })
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
      feature.setType(this.changes[idx].newType)
    }
  }

  getInverse() {
    const { assembly, changedIds, changes, logger, typeName } = this
    const inverseChangedIds = [...changedIds].reverse()
    const inverseChanges = [...changes].reverse().map((endChange) => ({
      featureId: endChange.featureId,
      oldType: endChange.newType,
      newType: endChange.oldType,
    }))
    return new TypeChange(
      {
        changedIds: inverseChangedIds,
        typeName,
        changes: inverseChanges,
        assembly,
      },
      { logger },
    )
  }
}
