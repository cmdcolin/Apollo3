/* eslint-disable @typescript-eslint/require-await */
import type {
  AnnotationFeatureSnapshot,
  CheckResultSnapshot,
} from '@apollo-annotation/mst'
import { getConf } from '@jbrowse/core/configuration'
import { type Region, getSession } from '@jbrowse/core/util'

import { BackendDriver, type RefNameAliases } from './BackendDriver'

export class InMemoryFileDriver extends BackendDriver {
  async getFeatures(): Promise<AnnotationFeatureSnapshot[]> {
    return []
  }

  async getCheckResults(): Promise<CheckResultSnapshot[]> {
    return []
  }

  async getSequence(region: Region) {
    const { assemblyName, end, refName, start } = region
    const assembly = this.clientStore.assemblies.get(assemblyName)
    if (!assembly) {
      return { seq: '', refSeq: refName }
    }
    const refSeq = assembly.refSeqs.get(refName)
    if (!refSeq) {
      return { seq: '', refSeq: refName }
    }
    const seq = refSeq.getSequence(start, end)
    return { seq, refSeq: refName }
  }

  async getRefNameAliases(assemblyName: string): Promise<RefNameAliases[]> {
    const assembly = this.clientStore.assemblies.get(assemblyName)
    const refNameAliases: RefNameAliases[] = []
    if (!assembly) {
      return refNameAliases
    }
    for (const [, refSeq] of assembly.refSeqs) {
      refNameAliases.push({
        refName: refSeq.name,
        aliases: [refSeq._id],
        uniqueId: `alias-${refSeq._id}`,
      })
    }
    return refNameAliases
  }

  async getRegions(assemblyName: string): Promise<Region[]> {
    const assembly = this.clientStore.assemblies.get(assemblyName)
    if (!assembly) {
      return []
    }
    const regions: Region[] = []
    for (const [, refSeq] of assembly.refSeqs) {
      regions.push({
        assemblyName,
        refName: refSeq.name,
        start: refSeq.sequence[0].start,
        end: refSeq.sequence[0].stop,
      })
    }
    return regions
  }

  getAssemblies() {
    const { assemblyManager } = getSession(this.clientStore)
    return assemblyManager.assemblies.filter((assembly) => {
      const sequenceMetadata = getConf(assembly, ['sequence', 'metadata']) as
        | { apollo?: boolean; file?: string }
        | undefined
      return Boolean(
        sequenceMetadata && !sequenceMetadata.apollo && !sequenceMetadata.file,
      )
    })
  }

  async searchFeatures(
    _term: string,
    _assemblies: string[],
  ): Promise<AnnotationFeatureSnapshot[]> {
    return []
  }
}
