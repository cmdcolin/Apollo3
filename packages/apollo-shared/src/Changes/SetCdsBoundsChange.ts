/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import {
  type ChangeOptions,
  type ClientDataStore,
  FeatureChange,
  type SerializedFeatureChange,
  type ServerDataStore,
} from '@apollo-annotation/common'

interface SerializedSetCdsBoundsChangeBase extends SerializedFeatureChange {
  typeName: 'SetCdsBoundsChange'
}

interface SetCdsBoundsChangeDetails {
  featureId: string
  oldMin: number
  newMin: number
  oldMax: number
  newMax: number
}

interface SerializedSetCdsBoundsChangeSingle
  extends SerializedSetCdsBoundsChangeBase,
    SetCdsBoundsChangeDetails {}

interface SerializedSetCdsBoundsChangeMultiple
  extends SerializedSetCdsBoundsChangeBase {
  changes: SetCdsBoundsChangeDetails[]
}

export type SerializedSetCdsBoundsChange =
  | SerializedSetCdsBoundsChangeSingle
  | SerializedSetCdsBoundsChangeMultiple

export class SetCdsBoundsChange extends FeatureChange {
  typeName = 'SetCdsBoundsChange' as const
  changes: SetCdsBoundsChangeDetails[]

  constructor(json: SerializedSetCdsBoundsChange, options?: ChangeOptions) {
    super(json, options)
    this.changes = 'changes' in json ? json.changes : [json]
  }

  // eslint-disable-next-line @typescript-eslint/class-literal-property-style
  get notification() {
    return 'CDS bounds updated successfully'
  }

  toJSON(): SerializedSetCdsBoundsChange {
    const { assembly, changedIds, changes, typeName } = this
    if (changes.length === 1) {
      const [{ featureId, newMax, newMin, oldMax, oldMin }] = changes
      return {
        typeName,
        changedIds,
        assembly,
        featureId,
        oldMin,
        newMin,
        oldMax,
        newMax,
      }
    }
    return { typeName, changedIds, assembly, changes }
  }

  async executeOnServer(backend: ServerDataStore) {
    const { featureRepository } = backend
    const { changes, logger } = this
    for (const change of changes) {
      const { featureId, newMax, newMin, oldMax, oldMin } = change
      logger.debug?.(
        `SetCdsBounds featureId=${featureId}, oldMin=${oldMin}, newMin=${newMin}, oldMax=${oldMax}, newMax=${newMax}`,
      )
      const row = await featureRepository.findById(featureId)
      if (!row) {
        const errMsg = `Feature not found: ${featureId}`
        logger.error(errMsg)
        throw new Error(errMsg)
      }
      if (row.min !== oldMin || row.max !== oldMax) {
        const errMsg = `Expected previous bounds do not match: row=[${row.min},${row.max}], expected=[${oldMin},${oldMax}]`
        logger.error(errMsg)
        throw new Error(errMsg)
      }
      await featureRepository.updateById(featureId, {
        min: newMin,
        max: newMax,
      })
    }
  }

  async executeOnClient(dataStore: ClientDataStore) {
    if (!dataStore) {
      throw new Error('No data store')
    }
    for (const change of this.changes) {
      const { featureId, newMax, newMin } = change
      const feature = dataStore.getFeature(featureId)
      if (!feature) {
        throw new Error(`Could not find feature with identifier "${featureId}"`)
      }
      feature.setMin(newMin)
      feature.setMax(newMax)
    }
  }

  getInverse() {
    const { assembly, changedIds, changes, logger, typeName } = this
    const inverseChangedIds = [...changedIds].reverse()
    const inverseChanges = [...changes].reverse().map((c) => ({
      featureId: c.featureId,
      oldMin: c.newMin,
      newMin: c.oldMin,
      oldMax: c.newMax,
      newMax: c.oldMax,
    }))
    return new SetCdsBoundsChange(
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

export function isSetCdsBoundsChange(
  change: unknown,
): change is SetCdsBoundsChange {
  return (change as SetCdsBoundsChange).typeName === 'SetCdsBoundsChange'
}
