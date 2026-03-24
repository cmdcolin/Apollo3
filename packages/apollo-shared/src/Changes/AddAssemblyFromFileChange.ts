import type {
  ChangeOptions,
  ClientDataStore,
  RefSeqRow,
  SequenceSource,
  SerializedAssemblySpecificChange,
  ServerDataStore,
} from '@apollo-annotation/common'
import { BgzipIndexedFasta, IndexedFasta } from '@gmod/indexedfasta'
import ObjectID from 'bson-objectid'
import { LocalFile, RemoteFile } from 'generic-filehandle2'

import { FromFileBaseChange } from './FromFileBaseChange.js'

function openFilehandle(pathOrUrl: string) {
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return new RemoteFile(pathOrUrl)
  }
  return new LocalFile(pathOrUrl)
}

export interface SerializedAddAssemblyFromFileChangeBase extends SerializedAssemblySpecificChange {
  typeName: 'AddAssemblyFromFileChange'
}

export interface AddAssemblyFromFileChangeDetails {
  assemblyName: string
  sequenceSource: SequenceSource
}

export interface SerializedAddAssemblyFromFileChangeSingle
  extends
    SerializedAddAssemblyFromFileChangeBase,
    AddAssemblyFromFileChangeDetails {}

export interface SerializedAddAssemblyFromFileChangeMultiple extends SerializedAddAssemblyFromFileChangeBase {
  changes: AddAssemblyFromFileChangeDetails[]
}

export type SerializedAddAssemblyFromFileChange =
  | SerializedAddAssemblyFromFileChangeSingle
  | SerializedAddAssemblyFromFileChangeMultiple

export class AddAssemblyFromFileChange extends FromFileBaseChange {
  typeName = 'AddAssemblyFromFileChange' as const
  changes: AddAssemblyFromFileChangeDetails[]

  constructor(
    json: SerializedAddAssemblyFromFileChange,
    options?: ChangeOptions,
  ) {
    super(json, options)
    this.changes = 'changes' in json ? json.changes : [json]
  }

  get notification(): string {
    return `Assembly "${this.changes[0].assemblyName}" added successfully. To use it, please refresh the page.`
  }

  toJSON(): SerializedAddAssemblyFromFileChange {
    const { assembly, changes, typeName } = this
    if (changes.length === 1) {
      const [{ assemblyName, sequenceSource }] = changes
      return { typeName, assembly, assemblyName, sequenceSource }
    }
    return { typeName, assembly, changes }
  }

  async executeOnServer(backend: ServerDataStore) {
    const { changes, logger } = this
    for (const change of changes) {
      const { assemblyName, sequenceSource } = change
      const allSequenceSizes = await this.getSequenceSizes(sequenceSource)

      const existingAssembly =
        await backend.assemblyRepository.findByName(assemblyName)
      if (existingAssembly) {
        throw new Error(`Assembly "${assemblyName}" already exists`)
      }
      const checkRows = await backend.checkRepository.findDefaults()
      const checks = checkRows.map((c) => c._id)
      await backend.assemblyRepository.create({
        _id: this.assembly,
        name: assemblyName,
        sequenceSource,
        checks,
      })
      this.logger.debug?.(
        `Added new assembly "${assemblyName}", id "${this.assembly}"`,
      )

      for (const sequenceName in allSequenceSizes) {
        const refSeqRow: RefSeqRow = {
          _id: new ObjectID().toHexString(),
          name: sequenceName,
          assembly: this.assembly,
          length: allSequenceSizes[sequenceName] ?? 0,
        }
        await backend.refSeqRepository.create(refSeqRow)
        this.logger.debug?.(
          `Added new refSeq "${sequenceName}", id "${refSeqRow._id}"`,
        )
      }
    }
    logger.debug?.('Assembly added')
  }

  private async getSequenceSizes(source: SequenceSource) {
    if (source.type === 'twobit') {
      const { TwoBitFile } = await import('@gmod/twobit')
      const twoBit = new TwoBitFile({
        filehandle: openFilehandle(source.twobit),
      })
      return twoBit.getSequenceSizes()
    }
    const fasta = openFilehandle(source.fa)
    const fai = openFilehandle(source.fai)
    const adapter = source.gzi
      ? new BgzipIndexedFasta({
          fasta,
          fai,
          gzi: openFilehandle(source.gzi),
        })
      : new IndexedFasta({ fasta, fai })
    const sizes = await adapter.getSequenceSizes()
    if (!sizes) {
      throw new Error('No data read from sequence adapter')
    }
    return sizes
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async executeOnClient(_dataStore: ClientDataStore) {}

  getInverse() {
    const { assembly, changes, logger, typeName } = this
    return new AddAssemblyFromFileChange(
      { typeName, changes, assembly },
      { logger },
    )
  }
}
