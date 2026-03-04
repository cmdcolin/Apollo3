/* eslint-disable @typescript-eslint/require-await */
import {
  type LocalGFF3DataStore,
  Operation,
  type OperationOptions,
  type SerializedOperation,
  type ServerDataStore,
  type ServerDataStoreV2,
  assembleFeatureTrees,
} from '@apollo-annotation/common'

interface SerializedGetFeaturesOperation extends SerializedOperation {
  typeName: 'GetFeaturesOperation'
  refSeq: string
  start: number
  end: number
}

export class GetFeaturesOperation extends Operation {
  typeName = 'GetFeaturesOperation' as const
  refSeq: string
  start: number
  end: number

  constructor(
    json: SerializedGetFeaturesOperation,
    options?: OperationOptions,
  ) {
    super(json, options)
    this.refSeq = json.refSeq
    this.start = json.start
    this.end = json.end
  }

  toJSON(): SerializedGetFeaturesOperation {
    const { end, refSeq, start, typeName } = this
    return { typeName, refSeq, start, end }
  }

  /**
   * Fetch features based on Reference seq, Start and End -values
   * @param request - Contain search criteria i.e. refSeq, start and end -parameters
   * @returns Return Array of features if search was successful
   * or if search data was not found or in case of error throw exception
   */
  executeOnServer(backend: ServerDataStore) {
    return backend.featureModel
      .find({
        refSeq: this.refSeq,
        min: { $lte: this.end },
        max: { $gte: this.start },
        status: 0,
      })
      .exec()
  }

  async executeOnServerV2(backend: ServerDataStoreV2) {
    const { featureRepository } = backend
    const rootRows = await featureRepository.findRootsByRange(
      this.refSeq,
      this.start,
      this.end,
    )
    const publishedRoots = rootRows.filter((r) => r.status === 0)
    const allRows = [...publishedRoots]
    const seen = new Set(publishedRoots.map((r) => r._id))
    for (const root of publishedRoots) {
      const descendants = await featureRepository.findDescendants(root._id)
      for (const d of descendants) {
        if (!seen.has(d._id)) {
          seen.add(d._id)
          allRows.push(d)
        }
      }
    }
    return assembleFeatureTrees(allRows)
  }

  async executeOnLocalGFF3(_backend: LocalGFF3DataStore) {
    throw new Error('executeOnLocalGFF3 not implemented')
  }
}
