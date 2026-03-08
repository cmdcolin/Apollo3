/* eslint-disable @typescript-eslint/require-await */
import {
  type ChangeOptions,
  type ClientDataStore,
  type SerializedAssemblySpecificChange,
  type ServerDataStore,
} from '@apollo-annotation/common'
import { type GFF3Feature } from '@gmod/gff'

import { FromFileBaseChange } from './FromFileBaseChange'

export interface SerializedAddFeaturesFromFileChangeBase
  extends SerializedAssemblySpecificChange {
  typeName: 'AddFeaturesFromFileChange'
  deleteExistingFeatures?: boolean
}

export interface AddFeaturesFromFileChangeDetails {
  fileId: string
  parseOptions?: { bufferSize: number }
}

export interface SerializedAddFeaturesFromFileChangeSingle
  extends SerializedAddFeaturesFromFileChangeBase,
    AddFeaturesFromFileChangeDetails {}

export interface SerializedAddFeaturesFromFileChangeMultiple
  extends SerializedAddFeaturesFromFileChangeBase {
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
      const [{ fileId }] = changes
      return { typeName, assembly, fileId, deleteExistingFeatures }
    }
    return { typeName, assembly, changes, deleteExistingFeatures }
  }

  async executeOnServer(backend: ServerDataStore) {
    const { changes, deleteExistingFeatures, logger } = this

    if (deleteExistingFeatures) {
      await this.removeExistingFeatures(backend)
    }

    for (const change of changes) {
      const { fileId, parseOptions } = change
      const fileRow = await backend.fileRepository.findById(fileId)
      if (!fileRow) {
        throw new Error(`File "${fileId}" not found`)
      }
      logger.debug?.(`FileId "${fileId}", checksum "${fileRow.checksum}"`)

      const { bufferSize = 10_000 } = parseOptions ?? {}
      const featureStream = backend.filesService.parseGFF3(
        backend.filesService.getFileStream(fileRow),
        { bufferSize },
      )
      let featureCount = 0
      // @ts-expect-error type is wrong here
      // eslint-disable-next-line @typescript-eslint/await-thenable
      for await (const f of featureStream) {
        const gff3Feature = f as GFF3Feature
        await this.addFeatureIntoDb(gff3Feature, backend)
        featureCount++
        if (featureCount % 1000 === 0) {
          logger.debug?.(`Processed ${featureCount} features`)
        }
      }
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
