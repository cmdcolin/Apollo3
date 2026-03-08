/* eslint-disable @typescript-eslint/require-await */

import {
  type ChangeOptions,
  type ClientDataStore,
  type SerializedAssemblySpecificChange,
  type ServerDataStore,
} from '@apollo-annotation/common'
import { type GFF3Feature } from '@gmod/gff'

import { FromFileBaseChange } from './FromFileBaseChange'

export interface SerializedAddAssemblyAndFeaturesFromFileChangeBase
  extends SerializedAssemblySpecificChange {
  typeName: 'AddAssemblyAndFeaturesFromFileChange'
}

export interface AddAssemblyAndFeaturesFromFileChangeDetails {
  assemblyName: string
  fileIds: { fa: string }
  parseOptions?: { bufferSize: number }
}

export interface SerializedAddAssemblyAndFeaturesFromFileChangeSingle
  extends SerializedAddAssemblyAndFeaturesFromFileChangeBase,
    AddAssemblyAndFeaturesFromFileChangeDetails {}

export interface SerializedAddAssemblyAndFeaturesFromFileChangeMultiple
  extends SerializedAddAssemblyAndFeaturesFromFileChangeBase {
  changes: AddAssemblyAndFeaturesFromFileChangeDetails[]
}

export type SerializedAddAssemblyAndFeaturesFromFileChange =
  | SerializedAddAssemblyAndFeaturesFromFileChangeSingle
  | SerializedAddAssemblyAndFeaturesFromFileChangeMultiple

export class AddAssemblyAndFeaturesFromFileChange extends FromFileBaseChange {
  typeName = 'AddAssemblyAndFeaturesFromFileChange' as const
  changes: AddAssemblyAndFeaturesFromFileChangeDetails[]

  constructor(
    json: SerializedAddAssemblyAndFeaturesFromFileChange,
    options?: ChangeOptions,
  ) {
    super(json, options)
    this.changes = 'changes' in json ? json.changes : [json]
  }

  get notification(): string {
    return `Assembly "${this.changes[0].assemblyName}" added successfully. To use it, please refresh the page.`
  }

  toJSON(): SerializedAddAssemblyAndFeaturesFromFileChange {
    const { assembly, changes, typeName } = this
    if (changes.length === 1) {
      const [{ assemblyName, fileIds }] = changes
      return { typeName, assembly, assemblyName, fileIds }
    }
    return { typeName, assembly, changes }
  }

  async executeOnServer(backend: ServerDataStore) {
    const { assembly, changes, logger } = this
    for (const change of changes) {
      const { assemblyName, fileIds, parseOptions } = change
      const fileId = fileIds.fa

      const fileRow = await backend.fileRepository.findById(fileId)
      if (!fileRow) {
        throw new Error(`File "${fileId}" not found`)
      }
      logger.debug?.(`FileId "${fileId}", checksum "${fileRow.checksum}"`)

      const existingAssembly =
        await backend.assemblyRepository.findByName(assemblyName)
      if (existingAssembly) {
        throw new Error(`Assembly "${assemblyName}" already exists`)
      }
      const checkRows = await backend.checkRepository.findDefaults()
      const checks = checkRows.map((c) => c._id)
      await backend.assemblyRepository.create({
        _id: assembly,
        name: assemblyName,
        user: backend.user,
        status: -1,
        file: fileId,
        checks,
      })
      logger.debug?.(`Added new assembly "${assemblyName}", id "${assembly}"`)

      await this.addRefSeqIntoDb(fileRow, assembly, backend)

      const { bufferSize = 10_000 } = parseOptions ?? {}
      const featureStream = backend.filesService.parseGFF3(
        backend.filesService.getFileStream(fileRow),
        { bufferSize },
      )
      // @ts-expect-error type is wrong here
      // eslint-disable-next-line @typescript-eslint/await-thenable
      for await (const f of featureStream) {
        const gff3Feature = f as GFF3Feature
        logger.verbose?.(`ENTRY=${JSON.stringify(gff3Feature)}`)
        await this.addFeatureIntoDb(gff3Feature, backend)
      }
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async executeOnClient(_dataStore: ClientDataStore) {}

  getInverse() {
    const { assembly, changes, logger, typeName } = this
    return new AddAssemblyAndFeaturesFromFileChange(
      { typeName, changes, assembly },
      { logger },
    )
  }
}
