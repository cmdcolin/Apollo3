/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/require-await */

import type {
  ChangeOptions,
  ClientDataStore,
  SerializedAssemblySpecificChange,
  ServerDataStore,
} from '@apollo-annotation/common'

import { FromFileBaseChange } from './FromFileBaseChange.js'

export interface SerializedAddAssemblyAndFeaturesFromFileChangeBase
  extends SerializedAssemblySpecificChange {
  typeName: 'AddAssemblyAndFeaturesFromFileChange'
}

export interface AddAssemblyAndFeaturesFromFileChangeDetails {
  assemblyName: string
  sequenceSource: { type: 'chunked'; fa: string }
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
      const [{ assemblyName, sequenceSource }] = changes
      return { typeName, assembly, assemblyName, sequenceSource }
    }
    return { typeName, assembly, changes }
  }

  async executeOnServer(backend: ServerDataStore) {
    const { assembly, changes, logger } = this
    for (const change of changes) {
      const { assemblyName, sequenceSource, parseOptions } = change
      const fileId = sequenceSource.fa

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
      // eslint-disable-next-line no-console
      console.log(
        `[DEBUG AddAssembly] findDefaults returned ${checkRows.length} checks: ${JSON.stringify(checkRows.map((c) => ({ _id: c._id, name: c.name, isDefault: c.isDefault })))}`,
      )
      // eslint-disable-next-line no-console
      console.log(
        `[DEBUG AddAssembly] assembly will have checks: ${JSON.stringify(checks)}`,
      )
      await backend.assemblyRepository.create({
        _id: assembly,
        name: assemblyName,
        user: backend.user,
        status: -1,
        sequenceSource,
        checks,
      })
      logger.debug?.(`Added new assembly "${assemblyName}", id "${assembly}"`)

      await this.addRefSeqIntoDb(fileRow, assembly, backend)

      const { bufferSize = 10_000 } = parseOptions ?? {}
      const featureStream = backend.filesService.parseGFF3(
        backend.filesService.getFileStream(fileRow),
        { bufferSize },
      )
      for await (const gff3Feature of featureStream) {
        logger.verbose?.(`ENTRY=${JSON.stringify(gff3Feature)}`)
        await this.addFeatureIntoDb(gff3Feature, backend)
      }
      await this.flushFeatureBuffer(backend)
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
