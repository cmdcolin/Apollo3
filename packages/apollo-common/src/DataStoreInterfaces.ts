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

import type {
  AssemblyRepository,
  CheckRepository,
  CheckResultRepository,
  FeatureRepository,
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
