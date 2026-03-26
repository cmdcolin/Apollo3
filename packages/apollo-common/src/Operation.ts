import type {
  AnnotationFeature,
  AnnotationFeatureSnapshot,
  ApolloAssemblyI,
  BackendDriverType,
  CheckResultI,
  CheckResultSnapshot,
} from '@apollo-annotation/mst'
import type { GFF3Feature } from '@gmod/gff'
import type { Region } from '@jbrowse/core/util'
import type { LoggerService } from '@nestjs/common'


import type {
  AssemblyRepository,
  CheckRepository,
  CheckResultRepository,
  FeatureRepository,
  RefSeqRepository,
  UserRepository,
} from './repositories/index.js'

export interface ClientDataStore {
  typeName: 'Client'
  assemblies: Map<string | number, ApolloAssemblyI>
  checkResults: Map<string | number, CheckResultI>
  loadFeatures(regions: Region[]): Promise<void>
  loadRefSeq(regions: Region[]): void
  getFeature(featureId: string): AnnotationFeature | undefined
  addFeature(assemblyId: string, feature: AnnotationFeatureSnapshot): void
  deleteFeature(featureId: string): void
  deleteAssembly(assemblyId: string): void
  addCheckResults(checkResults: CheckResultSnapshot[]): void
  addAssembly(
    assemblyId: string,
    backendDriverType?: BackendDriverType,
  ): ApolloAssemblyI
  clearCheckResults(): void
}

export interface ServerDataStore {
  typeName: 'Server'
  featureRepository: FeatureRepository
  assemblyRepository: AssemblyRepository
  refSeqRepository: RefSeqRepository
  checkRepository: CheckRepository
  checkResultRepository: CheckResultRepository
  userRepository: UserRepository
  parseGFF3(
    stream: ReadableStream<Uint8Array>,
    parseOptions?: { bufferSize?: number },
  ): ReadableStream<GFF3Feature>
  pluginsService: {
    evaluateExtensionPoint(
      extensionPointName: string,
      extendee: unknown,
      props?: Record<string, unknown>,
    ): unknown
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

  async execute(backend: ServerDataStore) {
    const initialResult = await this.executeOnServer(backend)
    return backend.pluginsService.evaluateExtensionPoint(
      `${this.typeName}-transformResults`,
      initialResult,
      { operation: this, backend },
    )
  }

  abstract executeOnServer(backend: ServerDataStore): Promise<unknown>
}
