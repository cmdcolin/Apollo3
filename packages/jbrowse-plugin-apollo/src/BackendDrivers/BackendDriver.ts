import type { ClientDataStore } from '@apollo-annotation/common'
import type {
  AnnotationFeatureSnapshot,
  CheckResultSnapshot,
} from '@apollo-annotation/mst'
import type { Assembly } from '@jbrowse/core/assemblyManager/assembly'
import type { Region } from '@jbrowse/core/util'

export interface RefNameAliases {
  refName: string
  aliases: string[]
  uniqueId: string
}

export abstract class BackendDriver {
  constructor(protected clientStore: ClientDataStore) {}

  abstract getFeatures(region: Region): Promise<AnnotationFeatureSnapshot[]>

  abstract getCheckResults(region: Region): Promise<CheckResultSnapshot[]>

  abstract getSequence(region: Region): Promise<{ seq: string; refSeq: string }>

  abstract getRegions(assemblyName: string): Promise<Region[]>

  abstract getAssemblies(): Assembly[]

  abstract getRefNameAliases(assemblyName: string): Promise<RefNameAliases[]>

  abstract searchFeatures(
    term: string,
    assemblies: string[],
  ): Promise<AnnotationFeatureSnapshot[]>
}
