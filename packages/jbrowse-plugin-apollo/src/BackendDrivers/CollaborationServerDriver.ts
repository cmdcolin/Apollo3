/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import type {
  AnnotationFeatureSnapshot,
  CheckResultSnapshot,
} from '@apollo-annotation/mst'
import { getConf } from '@jbrowse/core/configuration'
import { type Region, getSession } from '@jbrowse/core/util'

import type { ApolloSessionModel } from '../session'
import { createFetchErrorMessage, getBaseURL } from '../util'

import { BackendDriver, type RefNameAliases } from './BackendDriver'

export class CollaborationServerDriver extends BackendDriver {
  private inFlight = new Map<string, Promise<string>>()

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

    const response = await fetch(uri)
    if (!response.ok) {
      const errorMessage = await createFetchErrorMessage(
        response,
        'searchFeatures failed',
      )
      throw new Error(errorMessage)
    }
    return response.json() as Promise<AnnotationFeatureSnapshot[]>
  }

  async getFeatures(region: Region) {
    const { assemblyName, end, refName, start } = region
    const baseURL = this.getBaseURL()
    const url = new URL('features/getFeatures', baseURL)
    url.search = new URLSearchParams({
      assembly: assemblyName,
      refSeq: refName,
      start: String(start),
      end: String(end),
    }).toString()

    const response = await fetch(url.toString())
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
    const { assemblyName, end, refName, start } = region
    const baseURL = this.getBaseURL()
    const url = new URL('checks/range', baseURL)
    url.search = new URLSearchParams({
      assembly: assemblyName,
      refSeq: refName,
      start: String(start),
      end: String(end),
    }).toString()

    const response = await fetch(url.toString())
    if (!response.ok) {
      return []
    }
    return response.json() as Promise<CheckResultSnapshot[]>
  }

  async getSequence(region: Region): Promise<{ seq: string; refSeq: string }> {
    const { assemblyName, end, refName, start } = region
    const inFlightKey = `${refName}:${start}-${end}`
    const inFlightPromise = this.inFlight.get(inFlightKey)
    if (inFlightPromise) {
      const seq = await inFlightPromise
      return { seq, refSeq: refName }
    }
    let apolloAssembly = this.clientStore.assemblies.get(assemblyName)
    apolloAssembly ??= this.clientStore.addAssembly(assemblyName)
    let apolloRefSeq = apolloAssembly.refSeqs.get(refName)
    apolloRefSeq ??= apolloAssembly.addRefSeq(refName)
    const clientStoreSequence = apolloRefSeq.getSequence(start, end)
    if (clientStoreSequence.length === end - start) {
      return { seq: clientStoreSequence, refSeq: refName }
    }
    const baseURL = this.getBaseURL()

    const url = new URL('sequence', baseURL)
    const searchParams = new URLSearchParams({
      assembly: assemblyName,
      refSeq: refName,
      start: String(start),
      end: String(end),
    })
    url.search = searchParams.toString()
    const uri = url.toString()

    const seqPromise = this.getSeqFromServer(uri, apolloRefSeq, start, end)
    this.inFlight.set(inFlightKey, seqPromise)
    const seq = await seqPromise

    this.inFlight.delete(inFlightKey)
    return { seq, refSeq: refName }
  }

  private async getSeqFromServer(
    uri: string,
    apolloRefSeq: { addSequence(seq: { sequence: string; start: number; stop: number }): void },
    start: number,
    stop: number,
  ) {
    const response = await fetch(uri)
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

  async getRefNameAliases(_assemblyName: string): Promise<RefNameAliases[]> {
    return []
  }

  async getRegions(assemblyName: string): Promise<Region[]> {
    const { assemblyManager } = getSession(this.clientStore)
    const assembly = assemblyManager.get(assemblyName)
    if (!assembly) {
      throw new Error(`Could not find assembly with name "${assemblyName}"`)
    }
    await assemblyManager.waitForAssembly(assemblyName)
    return assembly.regions ?? []
  }

  async getAnalysisTools() {
    const baseURL = this.getBaseURL()
    const url = new URL('analysis/tools', baseURL)
    const response = await fetch(url.toString())
    if (!response.ok) {
      const errorMessage = await createFetchErrorMessage(
        response,
        'Failed to fetch analysis tools',
      )
      throw new Error(errorMessage)
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
    assemblyName?: string
    params: Record<string, unknown>
  }) {
    const baseURL = this.getBaseURL()
    const url = new URL('analysis/jobs', baseURL)
    const response = await fetch(url.toString(), {
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
    const response = await fetch(url.toString())
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
}
