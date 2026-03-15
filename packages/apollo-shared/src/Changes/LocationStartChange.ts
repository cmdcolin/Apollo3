 
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import {
  type ChangeOptions,
  type ClientDataStore,
  FeatureChange,
  type SerializedFeatureChange,
  type ServerDataStore,
} from '@apollo-annotation/common'

interface SerializedLocationStartChangeBase extends SerializedFeatureChange {
  typeName: 'LocationStartChange'
}

interface LocationStartChangeDetails {
  featureId: string
  oldStart: number
  newStart: number
}

interface SerializedLocationStartChangeSingle
  extends SerializedLocationStartChangeBase,
    LocationStartChangeDetails {}

interface SerializedLocationStartChangeMultiple
  extends SerializedLocationStartChangeBase {
  changes: LocationStartChangeDetails[]
}

export type SerializedLocationStartChange =
  | SerializedLocationStartChangeSingle
  | SerializedLocationStartChangeMultiple

export class LocationStartChange extends FeatureChange {
  typeName = 'LocationStartChange' as const
  changes: LocationStartChangeDetails[]

  constructor(json: SerializedLocationStartChange, options?: ChangeOptions) {
    super(json, options)
    this.changes = 'changes' in json ? json.changes : [json]
  }

  toJSON(): SerializedLocationStartChange {
    const { assembly, changedIds, changes, typeName } = this
    if (changes.length === 1) {
      const [{ featureId, newStart, oldStart }] = changes
      return { typeName, changedIds, assembly, featureId, oldStart, newStart }
    }
    return { typeName, changedIds, assembly, changes }
  }

  async executeOnServer(backend: ServerDataStore) {
    const { featureRepository } = backend
    const { changes, logger } = this
    for (const change of changes) {
      const { featureId, oldStart, newStart } = change
      console.log(
        `[DEBUG LocationStartChange] featureId=${featureId}, oldStart=${oldStart}, newStart=${newStart}`,
      )
      const row = await featureRepository.findById(featureId)
      if (!row) {
        const errMsg = `Feature not found: ${featureId}`
        logger.error(errMsg)
        throw new Error(errMsg)
      }
      console.log(
        `[DEBUG LocationStartChange] row.min=${row.min}, oldStart=${oldStart}`,
      )
      if (row.min !== oldStart) {
        const errMsg = `Expected previous min does not match: row.min=${row.min}, oldStart=${oldStart}`
        logger.error(errMsg)
        throw new Error(errMsg)
      }
      await featureRepository.updateById(featureId, { min: newStart })
      console.log(
        `[DEBUG LocationStartChange] updated featureId=${featureId} min to ${newStart}`,
      )
    }
  }
  async executeOnClient(dataStore: ClientDataStore) {
    if (!dataStore) {
      throw new Error('No data store')
    }
    for (const change of this.changes) {
      const { featureId, newStart } = change
      const feature = dataStore.getFeature(featureId)
      if (!feature) {
        throw new Error(`Could not find feature with identifier "${featureId}"`)
      }
      feature.setMin(newStart)
    }
  }

  getInverse() {
    const { assembly, changedIds, changes, logger, typeName } = this
    const inverseChangedIds = [...changedIds].reverse()
    const inverseChanges = [...changes].reverse().map((startChange) => ({
      featureId: startChange.featureId,
      oldStart: startChange.newStart,
      newStart: startChange.oldStart,
    }))
    return new LocationStartChange(
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

export function isLocationStartChange(
  change: unknown,
): change is LocationStartChange {
  return (change as LocationStartChange).typeName === 'LocationStartChange'
}
