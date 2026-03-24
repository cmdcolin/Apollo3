import type {
  ChangeOptions,
  ClientDataStore,
  RefSeqRow,
  SerializedAssemblySpecificChange,
  ServerDataStore,
} from '@apollo-annotation/common'
import ObjectID from 'bson-objectid'

import { FromFileBaseChange } from './FromFileBaseChange.js'

export interface SerializedAddAssemblyAndFeaturesFromFileChangeBase extends SerializedAssemblySpecificChange {
  typeName: 'AddAssemblyAndFeaturesFromFileChange'
}

export interface AddAssemblyAndFeaturesFromFileChangeDetails {
  assemblyName: string
  fastaPath: string
  faiPath: string
  gziPath?: string
  gff3Path: string
  parseOptions?: { bufferSize: number }
}

export interface SerializedAddAssemblyAndFeaturesFromFileChangeSingle
  extends
    SerializedAddAssemblyAndFeaturesFromFileChangeBase,
    AddAssemblyAndFeaturesFromFileChangeDetails {}

export interface SerializedAddAssemblyAndFeaturesFromFileChangeMultiple extends SerializedAddAssemblyAndFeaturesFromFileChangeBase {
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
      const [{ assemblyName, fastaPath, faiPath, gziPath, gff3Path }] =
        changes
      return {
        typeName,
        assembly,
        assemblyName,
        fastaPath,
        faiPath,
        gziPath,
        gff3Path,
      }
    }
    return { typeName, assembly, changes }
  }

  async executeOnServer(backend: ServerDataStore) {
    const { assembly, changes, logger } = this
    for (const change of changes) {
      const {
        assemblyName,
        fastaPath,
        faiPath,
        gff3Path,
        gziPath,
        parseOptions,
      } = change

      const existingAssembly =
        await backend.assemblyRepository.findByName(assemblyName)
      if (existingAssembly) {
        throw new Error(`Assembly "${assemblyName}" already exists`)
      }

      const sequenceSource = {
        type: 'fasta' as const,
        fa: fastaPath,
        fai: faiPath,
        gzi: gziPath,
      }

      const { IndexedFasta } = await import('@gmod/indexedfasta')
      const { LocalFile } = await import('generic-filehandle2')
      const adapter = new IndexedFasta({
        fasta: new LocalFile(fastaPath),
        fai: new LocalFile(faiPath),
      })
      const allSequenceSizes = await adapter.getSequenceSizes()

      const checkRows = await backend.checkRepository.findDefaults()
      const checks = checkRows.map((c) => c._id)
      await backend.assemblyRepository.create({
        _id: assembly,
        name: assemblyName,
        sequenceSource,
        checks,
      })
      logger.debug?.(`Created assembly "${assemblyName}" id="${assembly}"`)

      for (const seqName in allSequenceSizes) {
        const refSeqRow: RefSeqRow = {
          _id: new ObjectID().toHexString(),
          name: seqName,
          assembly,
          length: allSequenceSizes[seqName] ?? 0,
        }
        await backend.refSeqRepository.create(refSeqRow)
      }
      logger.debug?.(`RefSeqs added for "${assemblyName}"`)

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
        logger.verbose?.(`ENTRY=${JSON.stringify(gff3Feature)}`)
        await this.addFeatureIntoDb(gff3Feature, backend)
        featureCount++
      }
      logger.debug?.(`${featureCount} features parsed for "${assemblyName}"`)
      await this.flushFeatureBuffer(backend)
      logger.debug?.(`Features flushed for "${assemblyName}"`)
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
