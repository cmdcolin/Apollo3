import type {
  ChangeOptions,
  ClientDataStore,
  SerializedAssemblySpecificChange,
  ServerDataStore,
} from '@apollo-annotation/common'

import { FromFileBaseChange } from './FromFileBaseChange.js'

export interface SerializedAddFeaturesFromFileChangeBase extends SerializedAssemblySpecificChange {
  typeName: 'AddFeaturesFromFileChange'
  deleteExistingFeatures?: boolean
}

export interface AddFeaturesFromFileChangeDetails {
  gff3Path: string
  parseOptions?: { bufferSize: number }
}

export interface SerializedAddFeaturesFromFileChangeSingle
  extends
    SerializedAddFeaturesFromFileChangeBase,
    AddFeaturesFromFileChangeDetails {}

export interface SerializedAddFeaturesFromFileChangeMultiple extends SerializedAddFeaturesFromFileChangeBase {
  changes: AddFeaturesFromFileChangeDetails[]
}

export type SerializedAddFeaturesFromFileChange =
  | SerializedAddFeaturesFromFileChangeSingle
  | SerializedAddFeaturesFromFileChangeMultiple

export class AddFeaturesFromFileChange extends FromFileBaseChange {
  typeName = 'AddFeaturesFromFileChange' as const
  changes: AddFeaturesFromFileChangeDetails[]
  deleteExistingFeatures = false

  constructor(
    json: SerializedAddFeaturesFromFileChange,
    options?: ChangeOptions,
  ) {
    super(json, options)
    this.deleteExistingFeatures = json.deleteExistingFeatures ?? false
    this.changes = 'changes' in json ? json.changes : [json]
  }

  // eslint-disable-next-line @typescript-eslint/class-literal-property-style
  get notification(): string {
    return 'Features have been added. To see them, please refresh the page.'
  }

  toJSON(): SerializedAddFeaturesFromFileChange {
    const { assembly, changes, deleteExistingFeatures, typeName } = this
    if (changes.length === 1) {
      const [{ gff3Path }] = changes
      return { typeName, assembly, gff3Path, deleteExistingFeatures }
    }
    return { typeName, assembly, changes, deleteExistingFeatures }
  }

  async executeOnServer(backend: ServerDataStore) {
    const { changes, deleteExistingFeatures, logger } = this

    if (deleteExistingFeatures) {
      await this.removeExistingFeatures(backend)
    }

    for (const change of changes) {
      const { gff3Path, parseOptions } = change
      logger.debug?.(`Reading GFF3 from "${gff3Path}"`)

      const { createReadStream } = await import('node:fs')
      const { Readable } = await import('node:stream')
      const gff3Stream = Readable.toWeb(
        createReadStream(gff3Path),
      ) as ReadableStream<Uint8Array>
      const { bufferSize = 10_000 } = parseOptions ?? {}
      const featureStream = backend.parseGFF3(gff3Stream, {
        bufferSize,
      })
      let featureCount = 0
      for await (const gff3Feature of featureStream) {
        await this.addFeatureIntoDb(gff3Feature, backend)
        featureCount++
        if (featureCount % 1000 === 0) {
          logger.debug?.(`Processed ${featureCount} features`)
        }
      }
      await this.flushFeatureBuffer(backend)
    }
    logger.debug?.('New features added into database')
  }
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async executeOnClient(_dataStore: ClientDataStore) {}

  getInverse() {
    const { assembly, changes, logger, typeName } = this
    return new AddFeaturesFromFileChange(
      { typeName, changes, assembly },
      { logger },
    )
  }
}
