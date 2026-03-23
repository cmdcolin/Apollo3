/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import type { AssemblySpecificChange, Change } from '@apollo-annotation/common'
import type {
  AnnotationFeatureSnapshot,
  ApolloRefSeqI,
  CheckResultSnapshot,
} from '@apollo-annotation/mst'
import { ValidationResultSet } from '@apollo-annotation/shared'
import { getConf } from '@jbrowse/core/configuration'
import { type Region, getSession } from '@jbrowse/core/util'

import type { SubmitOpts } from '../ChangeManager'
import type { ApolloSessionModel } from '../session'
import { apolloFetch, createFetchErrorMessage, getBaseURL } from '../util'

import { BackendDriver, type RefNameAliases } from './BackendDriver'

export interface ApolloRefSeqResponse {
  _id: string
  name: string
  description?: string
  aliases: string[]
  length: string
  assembly: string
}

interface RefSeq {
  refName: string
  id: string
  aliases: string[]
}

type RefSeqMap = Map<string, RefSeq>

export class CollaborationServerDriver extends BackendDriver {
  private inFlight = new Map<string, Promise<string>>()

  private refSeqMaps = new Map<string, RefSeqMap>()

  private getBaseURL() {
    const session = getSession(
      this.clientStore,
    ) as unknown as ApolloSessionModel
    return getBaseURL(session)
  }

  async searchFeatures(term: string, assemblies: string[]) {
    const baseURL = this.getBaseURL()
    const url = new URL('features/searchFeatures', baseURL)
    const searchParams = new URLSearchParams({
      assemblies: assemblies.join(','),
      term,
    })
    url.search = searchParams.toString()
    const uri = url.toString()

    const response = await apolloFetch(uri)
    if (!response.ok) {
      const errorMessage = await createFetchErrorMessage(
        response,
        'searchFeatures failed',
      )
      throw new Error(errorMessage)
    }
    return response.json() as Promise<AnnotationFeatureSnapshot[]>
  }

  private async resolveRefSeq(region: Region) {
    const { assemblyName, refName, start, end } = region
    const { assemblyManager } = getSession(this.clientStore)
    const assembly = assemblyManager.get(assemblyName)
    if (!assembly) {
      throw new Error(`Could not find assembly with name "${assemblyName}"`)
    }
    const refSeqMap = await this.getRefSeqMapping(assemblyName)
    const refSeqEntry = refSeqMap.get(refName)
    if (!refSeqEntry) {
      throw new Error(`Could not find refSeq "${refName}"`)
    }
    return {
      refSeq: refSeqEntry.id,
      start,
      end,
      assemblyName,
      refName,
    }
  }

  async getFeatures(region: Region) {
    const { refSeq, start, end } = await this.resolveRefSeq(region)
    const baseURL = this.getBaseURL()
    const url = new URL('features/getFeatures', baseURL)
    url.search = new URLSearchParams({
      refSeq,
      start: String(start),
      end: String(end),
    }).toString()

    const response = await apolloFetch(url.toString())
    if (!response.ok) {
      const errorMessage = await createFetchErrorMessage(
        response,
        'getFeatures failed',
      )
      throw new Error(errorMessage)
    }

    return response.json() as Promise<AnnotationFeatureSnapshot[]>
  }

  async getCheckResults(region: Region) {
    const { refSeq, start, end } = await this.resolveRefSeq(region)
    const baseURL = this.getBaseURL()
    const url = new URL('checks/range', baseURL)
    url.search = new URLSearchParams({
      refSeq,
      start: String(start),
      end: String(end),
    }).toString()

    const response = await apolloFetch(url.toString())
    if (!response.ok) {
      return []
    }
    return response.json() as Promise<CheckResultSnapshot[]>
  }

  async getSequence(region: Region): Promise<{ seq: string; refSeq: string }> {
    const inFlightKey = `${region.refName}:${region.start}-${region.end}`
    const inFlightPromise = this.inFlight.get(inFlightKey)
    const { assemblyName, end, refName, start } = region
    const { assemblyManager } = getSession(this.clientStore)
    const assembly = assemblyManager.get(assemblyName)
    if (!assembly) {
      throw new Error(`Could not find assembly with name "${assemblyName}"`)
    }
    const refSeqMap = await this.getRefSeqMapping(assemblyName)
    const refSeqEntry = refSeqMap.get(refName)
    if (!refSeqEntry) {
      throw new Error(`Could not find refSeq "${refName}"`)
    }
    const refSeq = refSeqEntry.id
    if (inFlightPromise) {
      const seq = await inFlightPromise
      return { seq, refSeq }
    }
    let apolloAssembly = this.clientStore.assemblies.get(assemblyName)
    if (!apolloAssembly) {
      apolloAssembly = this.clientStore.addAssembly(assemblyName)
    }
    let apolloRefSeq = apolloAssembly.refSeqs.get(refSeq)
    if (!apolloRefSeq) {
      apolloRefSeq = apolloAssembly.addRefSeq(refSeq, refName)
    }
    const clientStoreSequence = apolloRefSeq.getSequence(start, end)
    if (clientStoreSequence.length === end - start) {
      return { seq: clientStoreSequence, refSeq }
    }
    const baseURL = this.getBaseURL()

    const url = new URL('sequence', baseURL)
    const searchParams = new URLSearchParams({
      refSeq,
      start: String(start),
      end: String(end),
    })
    url.search = searchParams.toString()
    const uri = url.toString()

    const seqPromise = this.getSeqFromServer(uri, apolloRefSeq, start, end)
    this.inFlight.set(inFlightKey, seqPromise)
    const seq = await seqPromise

    this.inFlight.delete(inFlightKey)
    return { seq, refSeq }
  }

  private async getSeqFromServer(
    uri: string,
    apolloRefSeq: ApolloRefSeqI,
    start: number,
    stop: number,
  ) {
    const response = await apolloFetch(uri)
    if (!response.ok) {
      let errorMessage
      try {
        errorMessage = await response.text()
      } catch {
        errorMessage = ''
      }
      throw new Error(
        `getSequence failed: ${response.status} (${response.statusText})${
          errorMessage ? ` (${errorMessage})` : ''
        }`,
      )
    }
    const seq = await response.text()
    apolloRefSeq.addSequence({ sequence: seq, start, stop })
    return seq
  }

  async getRefSeqMapping(assemblyName: string): Promise<RefSeqMap> {
    const cachedRefSeqMap = this.refSeqMaps.get(assemblyName)
    if (cachedRefSeqMap) {
      return cachedRefSeqMap
    }
    const { assemblyManager } = getSession(this.clientStore)
    const assembly = assemblyManager.get(assemblyName)
    if (!assembly) {
      throw new Error(`Could not find assembly with name "${assemblyName}"`)
    }
    const baseURL = this.getBaseURL()
    const url = new URL('refSeqs', baseURL)
    const searchParams = new URLSearchParams({ assembly: assemblyName })
    url.search = searchParams.toString()
    const uri = url.toString()

    const response = await apolloFetch(uri)
    if (!response.ok) {
      let errorMessage
      try {
        errorMessage = await response.text()
      } catch {
        errorMessage = ''
      }
      throw new Error(
        `getRefNameAliases failed: ${response.status} (${response.statusText})${
          errorMessage ? ` (${errorMessage})` : ''
        }`,
      )
    }
    const refSeqs = (await response.json()) as ApolloRefSeqResponse[]
    const refSeqMap = new Map<string, RefSeq>(
      refSeqs.map((refSeq) => [
        refSeq.name,
        { refName: refSeq.name, id: refSeq._id, aliases: refSeq.aliases ?? [] },
      ]),
    )
    this.refSeqMaps.set(assemblyName, refSeqMap)
    return refSeqMap
  }

  async getRefNameAliases(assemblyName: string): Promise<RefNameAliases[]> {
    console.warn(
      `[apollo-debug] CollaborationServerDriver.getRefNameAliases: assemblyName=${assemblyName}`,
    )
    const refSeqMap = await this.getRefSeqMapping(assemblyName)
    const result = [...refSeqMap.values()].map((refSeq) => ({
      refName: refSeq.refName,
      aliases: [...new Set([refSeq.id, ...refSeq.aliases])],
      uniqueId: `alias-${refSeq.id}`,
    }))
    console.warn(
      `[apollo-debug] CollaborationServerDriver.getRefNameAliases: returning ${result.length} aliases`,
    )
    return result
  }

  async getRefSeqId(assemblyName: string, refName: string) {
    const refSeqMap = await this.getRefSeqMapping(assemblyName)
    if (!refSeqMap) {
      return
    }
    const refSeq = refSeqMap.get(refName)
    return refSeq?.id
  }

  async getRegions(assemblyName: string): Promise<Region[]> {
    console.warn(
      `[apollo-debug] CollaborationServerDriver.getRegions: assemblyName=${assemblyName}`,
    )
    const { assemblyManager } = getSession(this.clientStore)
    const assembly = assemblyManager.get(assemblyName)
    if (!assembly) {
      throw new Error(`Could not find assembly with name "${assemblyName}"`)
    }
    const baseURL = this.getBaseURL()
    console.warn(
      `[apollo-debug] CollaborationServerDriver.getRegions: baseURL=${baseURL}`,
    )
    const url = new URL('refSeqs', baseURL)
    const searchParams = new URLSearchParams({ assembly: assemblyName })
    url.search = searchParams.toString()
    const uri = url.toString()
    console.warn(
      `[apollo-debug] CollaborationServerDriver.getRegions: fetching ${uri}`,
    )

    const response = await apolloFetch(uri)
    console.warn(
      `[apollo-debug] CollaborationServerDriver.getRegions: response status=${response.status}`,
    )
    if (!response.ok) {
      let errorMessage
      try {
        errorMessage = await response.text()
      } catch {
        errorMessage = ''
      }
      throw new Error(
        `getRegions failed: ${response.status} (${response.statusText})${
          errorMessage ? ` (${errorMessage})` : ''
        }`,
      )
    }
    const refSeqs = await response.json()
    console.warn(
      `[apollo-debug] CollaborationServerDriver.getRegions: got ${refSeqs.length} refSeqs`,
    )
    return refSeqs.map((refSeq: { name: string; length: number }) => ({
      refName: refSeq.name,
      start: 0,
      end: refSeq.length,
    }))
  }

  async getAnalysisTools() {
    const baseURL = this.getBaseURL()
    const url = new URL('analysis/tools', baseURL)
    const response = await apolloFetch(url.toString())
    if (!response.ok) {
      return []
    }
    return response.json() as Promise<
      {
        tool: string
        installed: boolean
        canBuildDb: boolean
        config?: Record<string, unknown>
      }[]
    >
  }

  async submitAnalysisJob(params: {
    tool: string
    assemblyId?: string
    params: Record<string, unknown>
  }) {
    const baseURL = this.getBaseURL()
    const url = new URL('analysis/jobs', baseURL)
    const response = await apolloFetch(url.toString(), {
      method: 'POST',
      body: JSON.stringify(params),
      headers: { 'Content-Type': 'application/json' },
    })
    if (!response.ok) {
      const errorMessage = await createFetchErrorMessage(
        response,
        'submitAnalysisJob failed',
      )
      throw new Error(errorMessage)
    }
    return response.json() as Promise<{ _id: string; status: string }>
  }

  async getAnalysisJob(jobId: string) {
    const baseURL = this.getBaseURL()
    const url = new URL(`analysis/jobs/${jobId}`, baseURL)
    const response = await apolloFetch(url.toString())
    if (!response.ok) {
      const errorMessage = await createFetchErrorMessage(
        response,
        'getAnalysisJob failed',
      )
      throw new Error(errorMessage)
    }
    return response.json() as Promise<{
      _id: string
      status: string
      error?: string
      results?: Record<string, unknown>
    }>
  }

  getAssemblies() {
    const { assemblyManager } = getSession(this.clientStore)
    return assemblyManager.assemblies.filter((assembly) => {
      const sequenceMetadata = getConf(assembly, ['sequence', 'metadata']) as
        | { apollo: boolean }
        | undefined
      return sequenceMetadata?.apollo === true
    })
  }

  async submitChange(
    change: Change | AssemblySpecificChange,
    _opts: SubmitOpts = {},
  ) {
    const baseURL = this.getBaseURL()
    const url = new URL('changes', baseURL).href
    const response = await apolloFetch(url, {
      method: 'POST',
      body: JSON.stringify(change.toJSON()),
      headers: { 'Content-Type': 'application/json' },
    })
    if (!response.ok) {
      const errorMessage = await createFetchErrorMessage(
        response,
        'submitChange failed',
      )
      throw new Error(errorMessage)
    }
    const results = new ValidationResultSet()
    return results
  }
}
