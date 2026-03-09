/* eslint-disable @typescript-eslint/no-confusing-void-expression */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
import type { GFF3Feature } from '@gmod/gff'
import type { LoggerService } from '@nestjs/common'
import type { GenericFilehandle } from 'generic-filehandle2'

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
} from './repositories/index.js'

interface CreateFileDto {
  readonly _id: string
  readonly basename: string
  readonly checksum: string
  readonly type: 'text/x-gff3' | 'text/x-fasta'
  readonly user: string
}

export interface UnitOfWork {
  commit(): Promise<void>
  rollback(): Promise<void>
}

export interface ServerDataStore {
  typeName: 'Server'
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
    getFileStream(file: {
      _id: string
      checksum: string
    }): ReadableStream<Uint8Array>
    getFileHandle(file: { _id: string; checksum: string }): GenericFilehandle
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

  async execute(backend: ServerDataStore): Promise<unknown> {
    const initialResult = this.executeOnServer(backend)
    return backend.pluginsService.evaluateExtensionPoint(
      `${this.typeName}-transformResults`,
      initialResult,
      { operation: this, backend },
    )
  }

  abstract executeOnServer(backend: ServerDataStore): Promise<unknown>
}
