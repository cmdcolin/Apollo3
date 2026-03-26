/* eslint-disable @typescript-eslint/require-await */
import type * as Fs from 'node:fs'

import type {
  AnnotationFeatureSnapshot,
  CheckResultSnapshot,
} from '@apollo-annotation/mst'
import { getConf } from '@jbrowse/core/configuration'
import { type Region, getSession } from '@jbrowse/core/util'

import { loadAssemblyIntoClient } from '../util'

import { BackendDriver, type RefNameAliases } from './BackendDriver'
import { getElectronRequire } from './electronRequire'

export class DesktopFileDriver extends BackendDriver {
  async loadAssembly(assemblyName: string) {
    const { assemblyManager } = getSession(this.clientStore)
    const assembly = assemblyManager.get(assemblyName)
    if (!assembly) {
      throw new Error(`Assembly ${assemblyName} not found`)
    }
    const { file } = getConf(assembly, ['sequence', 'metadata']) as {
      file: string
    }

    const fs = getElectronRequire()('node:fs') as typeof Fs
    const fileContents = await fs.promises.readFile(file, 'utf8')
    return loadAssemblyIntoClient(assemblyName, fileContents, this.clientStore)
  }

  async getAssembly(assemblyName: string) {
    let assembly = this.clientStore.assemblies.get(assemblyName)
    assembly ??= await this.loadAssembly(assemblyName)
    return assembly
  }

  async getRefNameAliases(assemblyName: string): Promise<RefNameAliases[]> {
    const assembly = await this.getAssembly(assemblyName)
    const refNameAliases: RefNameAliases[] = []
    for (const [, refSeq] of assembly.refSeqs) {
      refNameAliases.push({
        refName: refSeq.name,
        aliases: [refSeq._id],
        uniqueId: `alias-${refSeq._id}`,
      })
    }
    return refNameAliases
  }

  async getFeatures(region: Region): Promise<AnnotationFeatureSnapshot[]> {
    await this.getAssembly(region.assemblyName)
    return []
  }

  async getCheckResults(): Promise<CheckResultSnapshot[]> {
    return []
  }

  async getSequence(region: Region) {
    const { assemblyName, end, refName, start } = region
    const assembly = await this.getAssembly(assemblyName)
    const refSeq = assembly.refSeqs.get(refName)
    if (!refSeq) {
      throw new Error(`refSeq ${refName} not found in client data store`)
    }
    const seq = refSeq.getSequence(start, end)
    return { seq, refSeq: refName }
  }

  async getRegions(assemblyName: string): Promise<Region[]> {
    const assembly = await this.getAssembly(assemblyName)
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
        sequenceMetadata && !sequenceMetadata.apollo && sequenceMetadata.file,
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
