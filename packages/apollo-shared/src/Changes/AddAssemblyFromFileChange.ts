/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/require-await */
import type {
  ChangeOptions,
  ClientDataStore,
  RefSeqRow,
  SerializedAssemblySpecificChange,
  ServerDataStore,
} from '@apollo-annotation/common'
import { BgzipIndexedFasta } from '@gmod/indexedfasta'
import ObjectID from 'bson-objectid'

import { FromFileBaseChange } from './FromFileBaseChange.js'

export interface SerializedAddAssemblyFromFileChangeBase
  extends SerializedAssemblySpecificChange {
  typeName: 'AddAssemblyFromFileChange'
}

export interface AddAssemblyFromFileChangeDetails {
  assemblyName: string
  fileIds: { fa: string } | { fa: string; fai: string; gzi: string }
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
      const [{ assemblyName, fileIds }] = changes
      return { typeName, assembly, assemblyName, fileIds }
    }
    return { typeName, assembly, changes }
  }

  async executeOnServer(backend: ServerDataStore) {
    const { changes, logger } = this
    for (const change of changes) {
      const { assemblyName, fileIds } = change
      await ('gzi' in fileIds
        ? this.executeOnServerIndexed(backend, assemblyName, fileIds)
        : this.executeOnServerFasta(backend, assemblyName, fileIds.fa))
    }
    logger.debug?.('Assembly added')
  }

  private async executeOnServerIndexed(
    backend: ServerDataStore,
    assemblyName: string,
    fileIds: { fa: string; fai: string; gzi: string },
  ) {
    const { CHUNK_SIZE } = process.env
    const customChunkSize = CHUNK_SIZE ? Number(CHUNK_SIZE) : undefined
    const { fa: faId, fai: faiId, gzi: gziId } = fileIds

    const faDoc = await backend.fileRepository.findById(faId)
    if (!faDoc) {
      throw new Error(`File "${faId}" not found`)
    }
    const faiDoc = await backend.fileRepository.findById(faiId)
    if (!faiDoc) {
      throw new Error(`File "${faiId}" not found`)
    }
    const gziDoc = await backend.fileRepository.findById(gziId)
    if (!gziDoc) {
      throw new Error(`File "${gziId}" not found`)
    }

    const fasta = backend.filesService.getFileHandle(faDoc)
    const fai = backend.filesService.getFileHandle(faiDoc)
    const gzi = backend.filesService.getFileHandle(gziDoc)
    const sequenceAdapter = new BgzipIndexedFasta({ fasta, fai, gzi })
    const allSequenceSizes = await sequenceAdapter.getSequenceSizes()
    await Promise.all([fasta.close(), fai.close(), gzi.close()])

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
      fileIds,
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

  private async executeOnServerFasta(
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
      fileIds: { fa: fileId },
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
