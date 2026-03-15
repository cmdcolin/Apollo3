 
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import {
  type ChangeOptions,
  type ClientDataStore,
  FeatureChange,
  type SerializedFeatureChange,
  type ServerDataStore,
} from '@apollo-annotation/common'

interface SerializedStrandChangeBase extends SerializedFeatureChange {
  typeName: 'StrandChange'
}

interface StrandChangeDetails {
  featureId: string
  oldStrand: -1 | 1 | undefined
  newStrand: -1 | 1 | undefined
}

interface SerializedStrandChangeSingle
  extends SerializedStrandChangeBase,
    StrandChangeDetails {}

interface SerializedStrandChangeMultiple extends SerializedStrandChangeBase {
  changes: StrandChangeDetails[]
}

type SerializedStrandChange =
  | SerializedStrandChangeSingle
  | SerializedStrandChangeMultiple

export class StrandChange extends FeatureChange {
  typeName = 'StrandChange' as const
  changes: StrandChangeDetails[]

  constructor(json: SerializedStrandChange, options?: ChangeOptions) {
    super(json, options)
    this.changes = 'changes' in json ? json.changes : [json]
  }

  toJSON(): SerializedStrandChange {
    const { assembly, changedIds, changes, typeName } = this
    if (changes.length === 1) {
      const [{ featureId, newStrand, oldStrand }] = changes
      return { typeName, changedIds, assembly, featureId, oldStrand, newStrand }
    }
    return { typeName, changedIds, assembly, changes }
  }

  async executeOnServer(backend: ServerDataStore) {
    const { featureRepository } = backend
    const { changes, logger } = this
    for (const change of changes) {
      const { featureId, oldStrand, newStrand } = change
      const row = await featureRepository.findById(featureId)
      if (!row) {
        const errMsg = `Feature not found: ${featureId}`
        logger.error(errMsg)
        throw new Error(errMsg)
      }
      if (row.strand !== oldStrand) {
        const errMsg = `Feature's current strand "${row.strand}" doesn't match with expected value "${oldStrand}"`
        logger.error(errMsg)
        throw new Error(errMsg)
      }
      await featureRepository.updateById(featureId, { strand: newStrand })
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
      feature.setStrand(this.changes[idx].newStrand)
    }
  }

  getInverse() {
    const { assembly, changedIds, changes, logger, typeName } = this
    const inverseChangedIds = [...changedIds].reverse()
    const inverseChanges = [...changes].reverse().map((endChange) => ({
      featureId: endChange.featureId,
      oldStrand: endChange.newStrand,
      newStrand: endChange.oldStrand,
    }))
    return new StrandChange(
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
