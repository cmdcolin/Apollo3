/* eslint-disable @typescript-eslint/no-confusing-void-expression */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
import { type FileHandle } from 'node:fs/promises'

import {
  type AssemblyDocument,
  type CheckDocument,
  type FeatureDocument,
  type FileDocument,
  type JBrowseConfigDocument,
  type RefSeqChunkDocument,
  type RefSeqDocument,
  type UserDocument,
} from '@apollo-annotation/schemas'
import { type GFF3Feature } from '@gmod/gff'
import { type LoggerService } from '@nestjs/common'
import { type GenericFilehandle } from 'generic-filehandle'
import { type ClientSession, type Model } from 'mongoose'

import type {
  AssemblyRepository,
  CheckRepository,
  CheckResultRepository,
  FeatureRepository,
  FileRepository,
  JBrowseConfigRepository,
  RefSeqChunkRepository,
  RefSeqRepository,
  UserRepository,
} from './repositories'

export interface LocalGFF3DataStore {
  typeName: 'LocalGFF3'
  gff3Handle: FileHandle
}

interface CreateFileDto {
  readonly _id: string
  readonly basename: string
  readonly checksum: string
  readonly type: 'text/x-gff3' | 'text/x-fasta'
  readonly user: string
}

export interface ServerDataStore {
  typeName: 'Server'
  featureModel: Model<FeatureDocument>
  assemblyModel: Model<AssemblyDocument>
  refSeqModel: Model<RefSeqDocument>
  refSeqChunkModel: Model<RefSeqChunkDocument>
  checkModel: Model<CheckDocument>
  fileModel: Model<FileDocument>
  userModel: Model<UserDocument>
  jbrowseConfigModel: Model<JBrowseConfigDocument>
  session: ClientSession
  filesService: {
    getFileStream(file: FileDocument): ReadableStream<Uint8Array>
    getFileHandle(file: FileDocument): GenericFilehandle
    parseGFF3(
      stream: ReadableStream<Uint8Array>,
      parseOptions?: { bufferSize?: number },
    ): ReadableStream<GFF3Feature>
    create(createFileDto: CreateFileDto): void
    remove(id: string): void
  }
  pluginsService: {
    evaluateExtensionPoint(
      extensionPointName: string,
      extendee: unknown,
      props?: Record<string, unknown>,
    ): void
  }
  counterService: {
    getNextSequenceValue(sequenceName: string): Promise<number>
  }
  user: string
}
export interface UnitOfWork {
  commit(): Promise<void>
  rollback(): Promise<void>
}

export interface ServerDataStoreV2 {
  typeName: 'ServerV2'
  featureRepository: FeatureRepository
  assemblyRepository: AssemblyRepository
  refSeqRepository: RefSeqRepository
  refSeqChunkRepository: RefSeqChunkRepository
  checkRepository: CheckRepository
  checkResultRepository: CheckResultRepository
  fileRepository: FileRepository
  userRepository: UserRepository
  jbrowseConfigRepository: JBrowseConfigRepository
  unitOfWork: UnitOfWork
  filesService: {
    getFileStream(file: { _id: string }): ReadableStream<Uint8Array>
    getFileHandle(file: { _id: string }): GenericFilehandle
    parseGFF3(
      stream: ReadableStream<Uint8Array>,
      parseOptions?: { bufferSize?: number },
    ): ReadableStream<GFF3Feature>
    create(createFileDto: CreateFileDto): void
    remove(id: string): void
  }
  pluginsService: {
    evaluateExtensionPoint(
      extensionPointName: string,
      extendee: unknown,
      props?: Record<string, unknown>,
    ): void
  }
  counterService: {
    getNextSequenceValue(sequenceName: string): Promise<number>
  }
  user: string
}

export interface SerializedOperation {
  typeName: string
}

export type BackendDataStore =
  | ServerDataStore
  | ServerDataStoreV2
  | LocalGFF3DataStore

export interface OperationOptions {
  logger: LoggerService
}

export abstract class Operation implements SerializedOperation {
  protected logger: LoggerService
  abstract typeName: string

  constructor(json: SerializedOperation, options?: OperationOptions) {
    this.logger = options?.logger ?? console
  }

  abstract toJSON(): SerializedOperation

  async execute(backend: BackendDataStore): Promise<unknown> {
    const backendType = backend.typeName
    if (backendType === 'Server') {
      const initialResult = this.executeOnServer(backend)
      return backend.pluginsService.evaluateExtensionPoint(
        `${this.typeName}-transformResults`,
        initialResult,
        { operation: this, backend },
      )
    }
    if (backendType === 'ServerV2') {
      const initialResult = this.executeOnServerV2(backend)
      return backend.pluginsService.evaluateExtensionPoint(
        `${this.typeName}-transformResults`,
        initialResult,
        { operation: this, backend },
      )
    }
    if (backendType === 'LocalGFF3') {
      return this.executeOnLocalGFF3(backend)
    }
    throw new Error(
      `no operation implementation for backend type '${backendType}'`,
    )
  }

  abstract executeOnServer(backend: ServerDataStore): Promise<unknown>
  abstract executeOnLocalGFF3(backend: LocalGFF3DataStore): Promise<unknown>

  executeOnServerV2(_backend: ServerDataStoreV2): Promise<unknown> {
    throw new Error(`${this.typeName} does not implement executeOnServerV2`)
  }
}
