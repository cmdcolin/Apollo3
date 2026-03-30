import type { NestedFeature } from '@apollo-annotation/common'
import type {
  AnnotationFeatureSnapshot,
  CheckResultSnapshot,
} from '@apollo-annotation/mst'
import { getSession } from '@jbrowse/core/util'
import type { IAnyStateTreeNode } from '@jbrowse/mobx-state-tree'

import type { ApolloSessionModel } from './session'
import { createFetchErrorMessage, getBaseURL, isReadOnly } from './util'

// Raw SQL queries and undo cycles can produce attributes as JSON strings
// instead of objects. Parse them recursively before applying to the MST tree.
function fixFeatureSnapshot(f: NestedFeature) {
  let attrs = f.attributes as Record<string, string[]> | string | undefined
  while (typeof attrs === 'string') {
    attrs = JSON.parse(attrs) as Record<string, string[]> | string
  }
  f.attributes = attrs
  if (f.children) {
    for (const child of Object.values(f.children)) {
      fixFeatureSnapshot(child)
    }
  }
}

interface MutationResult {
  features: NestedFeature[]
  deletedFeatureIds: string[]
  changeSequence: number
  assemblyId: string
  checkResults?: CheckResultSnapshot[]
}

export class FeatureService {
  constructor(private dataStore: IAnyStateTreeNode) {}

  recentSequences: number[] = []
  undoneSequences: number[] = []

  private getSession() {
    return getSession(this.dataStore) as unknown as ApolloSessionModel
  }

  private getBaseURL() {
    return getBaseURL(this.getSession())
  }

  private async fetchMutation(
    url: string,
    method: string,
    body?: unknown,
  ): Promise<MutationResult> {
    const baseURL = this.getBaseURL()
    if (!baseURL) {
      throw new Error('No base URL configured')
    }
    const fullUrl = new URL(url, baseURL)
    const response = await fetch(fullUrl.toString(), {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'include',
    })
    if (!response.ok) {
      const msg = await createFetchErrorMessage(
        response,
        `${method} ${url} failed`,
      )
      throw new Error(msg)
    }
    return response.json() as Promise<MutationResult>
  }

  private guardReadOnly() {
    const session = this.getSession()
    if (isReadOnly(session)) {
      ;(session as unknown as { notify(msg: string, level: string): void }).notify(
        'Read-only mode: changes are not allowed',
        'warning',
      )
      return true
    }
    return false
  }

  async updateFeature(
    featureId: string,
    updates: {
      min?: number
      max?: number
      strand?: 1 | -1 | null
      type?: string
      attributes?: Record<string, string[]>
    },
  ) {
    if (this.guardReadOnly()) {
      return
    }
    const result = await this.fetchMutation(
      `features/${featureId}`,
      'PATCH',
      updates,
    )
    this.recentSequences.push(result.changeSequence)
    this.undoneSequences = []
    this.applyResult(result)
    return result
  }

  async addFeature(
    addedFeature: AnnotationFeatureSnapshot,
    assemblyId: string,
    parentFeatureId?: string,
  ) {
    if (this.guardReadOnly()) {
      return
    }
    const result = await this.fetchMutation('features', 'POST', {
      addedFeature,
      assemblyId,
      parentFeatureId,
    })
    this.recentSequences.push(result.changeSequence)
    this.undoneSequences = []
    this.applyResult(result)
    return result
  }

  async deleteFeature(featureId: string) {
    if (this.guardReadOnly()) {
      return
    }
    const result = await this.fetchMutation(
      `features/${featureId}`,
      'DELETE',
    )
    this.recentSequences.push(result.changeSequence)
    this.undoneSequences = []
    this.applyResult(result)
    return result
  }

  async mergeExons(firstExonId: string, secondExonId: string) {
    if (this.guardReadOnly()) {
      return
    }
    const result = await this.fetchMutation('features/merge-exons', 'POST', {
      firstExonId,
      secondExonId,
    })
    this.recentSequences.push(result.changeSequence)
    this.undoneSequences = []
    this.applyResult(result)
    return result
  }

  async splitExon(exonId: string, splitPoint: number) {
    if (this.guardReadOnly()) {
      return
    }
    const result = await this.fetchMutation('features/split-exon', 'POST', {
      exonId,
      splitPoint,
    })
    this.recentSequences.push(result.changeSequence)
    this.undoneSequences = []
    this.applyResult(result)
    return result
  }

  async mergeTranscripts(
    firstTranscriptId: string,
    secondTranscriptId: string,
  ) {
    if (this.guardReadOnly()) {
      return
    }
    const result = await this.fetchMutation(
      'features/merge-transcripts',
      'POST',
      { firstTranscriptId, secondTranscriptId },
    )
    this.recentSequences.push(result.changeSequence)
    this.undoneSequences = []
    this.applyResult(result)
    return result
  }

  async splitTranscript(transcriptId: string, splitPoint: number) {
    if (this.guardReadOnly()) {
      return
    }
    const result = await this.fetchMutation(
      'features/split-transcript',
      'POST',
      { transcriptId, splitPoint },
    )
    this.recentSequences.push(result.changeSequence)
    this.undoneSequences = []
    this.applyResult(result)
    return result
  }

  async undoLastChange() {
    const session = this.getSession()
    const seq = this.recentSequences.pop()
    if (seq === undefined) {
      ;(session as unknown as { notify(msg: string, level: string): void }).notify(
        'No changes to undo!',
        'info',
      )
      return
    }
    const result = await this.fetchMutation('features/undo', 'POST', {
      sequence: seq,
    })
    this.undoneSequences.push(result.changeSequence)
    this.applyResult(result)
    return result
  }

  async redoLastChange() {
    const session = this.getSession()
    const seq = this.undoneSequences.pop()
    if (seq === undefined) {
      ;(session as unknown as { notify(msg: string, level: string): void }).notify(
        'No changes to redo!',
        'info',
      )
      return
    }
    const result = await this.fetchMutation('features/undo', 'POST', {
      sequence: seq,
    })
    this.recentSequences.push(result.changeSequence)
    this.applyResult(result)
    return result
  }

  applyResult(result: MutationResult) {
    const { apolloDataStore } = this.getSession()
    const { assemblyId, checkResults, deletedFeatureIds, features } = result

    for (const feature of features) {
      fixFeatureSnapshot(feature)
    }

    apolloDataStore.applyFeatureUpdate(
      assemblyId,
      features as AnnotationFeatureSnapshot[],
      deletedFeatureIds,
    )

    if (checkResults) {
      apolloDataStore.addCheckResults(checkResults)
    }
  }
}
