/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/require-await */
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
import { BlobFile, RemoteFile } from 'generic-filehandle2'

import { FromFileBaseChange } from './FromFileBaseChange.js'

export interface SerializedAddAssemblyFromFileChangeBase
  extends SerializedAssemblySpecificChange {
  typeName: 'AddAssemblyFromFileChange'
}

export interface AddAssemblyFromFileChangeDetails {
  assemblyName: string
  sequenceSource: SequenceSource
}

export interface SerializedAddAssemblyFromFileChangeSingle
  extends SerializedAddAssemblyFromFileChangeBase,
    AddAssemblyFromFileChangeDetails {}

export interface SerializedAddAssemblyFromFileChangeMultiple
  extends SerializedAddAssemblyFromFileChangeBase {
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
      switch (sequenceSource.type) {
        case 'external': {
          await this.executeOnServerExternal(
            backend,
            assemblyName,
            sequenceSource,
          )
          break
        }
        case 'indexed': {
          await this.executeOnServerIndexed(
            backend,
            assemblyName,
            sequenceSource,
          )
          break
        }
        case 'chunked': {
          await this.executeOnServerChunked(
            backend,
            assemblyName,
            sequenceSource.fa,
          )
          break
        }
      }
    }
    logger.debug?.('Assembly added')
  }

  private async createAssemblyAndRefSeqs(
    backend: ServerDataStore,
    assemblyName: string,
    sequenceSource: SequenceSource,
    allSequenceSizes: Record<string, number>,
  ) {
    const { CHUNK_SIZE } = process.env
    const customChunkSize = CHUNK_SIZE ? Number(CHUNK_SIZE) : undefined

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
      user: backend.user,
      status: -1,
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
        chunkSize: customChunkSize ?? 262_144,
        user: backend.user,
        status: -1,
      }
      await backend.refSeqRepository.create(refSeqRow)
      this.logger.debug?.(
        `Added new refSeq "${sequenceName}", id "${refSeqRow._id}"`,
      )
    }
  }

  private async executeOnServerExternal(
    backend: ServerDataStore,
    assemblyName: string,
    source: { type: 'external'; fa: string; fai: string; gzi?: string },
  ) {
    const { fa, fai, gzi } = source
    const sequenceAdapter = gzi
      ? new BgzipIndexedFasta({
          fasta: new RemoteFile(fa, { fetch }),
          fai: new RemoteFile(fai, { fetch }),
          gzi: new RemoteFile(gzi, { fetch }),
        })
      : new IndexedFasta({
          fasta: new RemoteFile(fa, { fetch }),
          fai: new RemoteFile(fai, { fetch }),
        })
    const allSequenceSizes = await sequenceAdapter.getSequenceSizes()
    if (!allSequenceSizes) {
      throw new Error('No data read from indexed fasta getSequenceSizes')
    }
    await this.createAssemblyAndRefSeqs(
      backend,
      assemblyName,
      source,
      allSequenceSizes,
    )
  }

  private async executeOnServerIndexed(
    backend: ServerDataStore,
    assemblyName: string,
    source: { type: 'indexed'; fa: string; fai: string; gzi: string },
  ) {
    const faDoc = await backend.fileRepository.findById(source.fa)
    if (!faDoc) {
      throw new Error(`File "${source.fa}" not found`)
    }
    const faiDoc = await backend.fileRepository.findById(source.fai)
    if (!faiDoc) {
      throw new Error(`File "${source.fai}" not found`)
    }
    const gziDoc = await backend.fileRepository.findById(source.gzi)
    if (!gziDoc) {
      throw new Error(`File "${source.gzi}" not found`)
    }

    const fasta = backend.filesService.getFileHandle(faDoc)
    const [faiDecompressed, gziDecompressed] = await Promise.all([
      backend.filesService.getDecompressedFileContents(faiDoc),
      backend.filesService.getDecompressedFileContents(gziDoc),
    ])
    const fai = new BlobFile(new Blob([faiDecompressed]))
    const gzi = new BlobFile(new Blob([gziDecompressed]))
    const sequenceAdapter = new BgzipIndexedFasta({ fasta, fai, gzi })
    const allSequenceSizes = await sequenceAdapter.getSequenceSizes()
    await fasta.close()

    await this.createAssemblyAndRefSeqs(
      backend,
      assemblyName,
      source,
      allSequenceSizes,
    )
  }

  private async executeOnServerChunked(
    backend: ServerDataStore,
    assemblyName: string,
    fileId: string,
  ) {
    const fileRow = await backend.fileRepository.findById(fileId)
    if (!fileRow) {
      throw new Error(`File "${fileId}" not found`)
    }
    this.logger.debug?.(`FileId "${fileId}", checksum "${fileRow.checksum}"`)

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
      user: backend.user,
      status: -1,
      sequenceSource: { type: 'chunked', fa: fileId },
      checks,
    })
    this.logger.debug?.(
      `Added new assembly "${assemblyName}", id "${this.assembly}"`,
    )

    await this.addRefSeqIntoDb(fileRow, this.assembly, backend)
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
