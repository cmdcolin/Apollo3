import {
  AssemblySpecificChange,
  type FeatureRow,
  type RefSeqRow,
  type ServerDataStore,
} from '@apollo-annotation/common'
import type { GFF3Feature } from '@gmod/gff'
import ObjectID from 'bson-objectid'

import { gff3ToAnnotationFeature } from '../GFF3/index.js'

import { flattenFeatureSnapshot } from './AddFeatureChange.js'

export abstract class FromFileBaseChange extends AssemblySpecificChange {
  async removeExistingFeatures(backend: ServerDataStore) {
    const { assembly, logger } = this
    logger.debug?.(`Removing existing features for assembly = ${assembly}`)
    const refSeqs = await backend.refSeqRepository.findByAssembly(assembly)
    const refSeqIds = refSeqs.map((r) => r._id)
    await backend.featureRepository.deleteByRefSeqs(refSeqIds)
  }

  private refSeqCache = new Map<string, RefSeqRow>()
  private featureBuffer: FeatureRow[] = []
  private readonly FEATURE_BATCH_SIZE = 500

  async addFeatureIntoDb(gff3Feature: GFF3Feature, backend: ServerDataStore) {
    const { assembly, refSeqCache } = this

    const [{ seq_id: refName }] = gff3Feature
    if (!refName) {
      throw new Error(
        `Valid seq_id not found in feature ${JSON.stringify(gff3Feature)}`,
      )
    }
    let refSeqRow = refSeqCache.get(refName)
    if (!refSeqRow) {
      refSeqRow =
        (await backend.refSeqRepository.findByNameAndAssembly(
          refName,
          assembly,
        )) ?? undefined
      if (refSeqRow) {
        refSeqCache.set(refName, refSeqRow)
      }
    }
    if (!refSeqRow) {
      throw new Error(
        `RefSeq was not found by assembly "${assembly}" and seq_id "${refName}" not found`,
      )
    }
    const newFeature = gff3ToAnnotationFeature(gff3Feature, refSeqRow._id)
    const rows = flattenFeatureSnapshot(newFeature, refSeqRow._id)
    for (const row of rows) {
      this.featureBuffer.push(row)
    }
    if (this.featureBuffer.length >= this.FEATURE_BATCH_SIZE) {
      await this.flushFeatureBuffer(backend)
    }
  }

  async flushFeatureBuffer(backend: ServerDataStore) {
    if (this.featureBuffer.length > 0) {
      await backend.featureRepository.createMany(this.featureBuffer)
      this.featureBuffer = []
    }
  }
}
