 
import {
  Operation,
  type OperationOptions,
  type SerializedOperation,
  type ServerDataStore,
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

  async executeOnServer(backend: ServerDataStore) {
    const { featureRepository } = backend
    const rootRows = await featureRepository.findRootsByRange(
      this.refSeq,
      this.start,
      this.end,
    )
    const publishedRoots = rootRows.filter((r) => r.status === 0)
    if (publishedRoots.length === 0) {
      return []
    }
    const rootIds = publishedRoots.map((r) => r._id)
    const allDescendants = await featureRepository.findDescendantsOfMany(rootIds)
    const allRows = [...publishedRoots, ...allDescendants]
    return assembleFeatureTrees(allRows)
  }
}
