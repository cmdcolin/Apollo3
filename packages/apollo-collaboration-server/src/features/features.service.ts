import {
  type FeatureRow,
  assembleFeatureTrees,
} from '@apollo-annotation/common'
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'

import { ChecksService } from '../checks/checks.service.js'
import type { FeatureRangeSearchDto } from '../entity/gff3Object.dto.js'
import { DatabaseService } from '../mikro-orm/database.service.js'

import type {
  FeatureCountRequest,
  GetByIndexedIdRequest,
} from './dto/feature.dto.js'

@Injectable()
export class FeaturesService {
  constructor(
    @Inject(ChecksService) private readonly checksService: ChecksService,
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  private readonly logger = new Logger(FeaturesService.name)

  async findAll() {
    return this.db.feature.findAll()
  }

  async getFeatureCount(featureCountRequest: FeatureCountRequest) {
    const { assemblyId, end, refSeqId, start } = featureCountRequest

    let count = 0
    if (refSeqId) {
      count = await this.db.feature.countByRange(
        refSeqId,
        start ?? 0,
        end ?? Number.MAX_SAFE_INTEGER,
      )
    } else if (assemblyId) {
      const refSeqs = await this.db.refSeq.findByAssembly(assemblyId)
      const refSeqIds = refSeqs.map((rs) => rs._id)
      count = await this.db.feature.countByRangeMultiple(
        refSeqIds,
        start ?? 0,
        end ?? Number.MAX_SAFE_INTEGER,
      )
    } else {
      count = await this.db.feature.countAll()
    }

    this.logger.debug(`Number of features is ${count}`)
    return count
  }

  async getByIndexedId(getByIndexedIdRequest: GetByIndexedIdRequest) {
    const { assemblies, id, topLevel } = getByIndexedIdRequest
    let refSeqIds: string[] | undefined
    if (assemblies) {
      const assemblyIds = assemblies.split(',')
      const refSeqs = await this.db.refSeq.findByAssemblies(assemblyIds)
      refSeqIds = refSeqs.map((rs) => rs._id)
    }
    const topLevelFeatures = await this.db.feature.findByIndexedId(
      id,
      refSeqIds,
    )
    if (topLevelFeatures.length === 0) {
      return []
    }
    if (topLevel) {
      return topLevelFeatures
    }
    const results: FeatureRow[] = []
    for (const rootFeature of topLevelFeatures) {
      const match = await this.findFeatureWithAttribute(rootFeature, id)
      if (match) {
        results.push(match)
      }
    }
    return results
  }

  private async findFeatureWithAttribute(
    rootFeature: FeatureRow,
    value: string,
  ) {
    const descendants = await this.db.feature.findDescendants(rootFeature._id)
    for (const feature of [rootFeature, ...descendants]) {
      if (feature.attributes) {
        const hasMatch = Object.values(feature.attributes).some((vals) =>
          vals.includes(value),
        )
        if (hasMatch) {
          return feature
        }
      }
    }
    return undefined
  }

  async findByFeatureIds(featureIds: string[], topLevel?: boolean) {
    const uniqueIds = [...new Set(featureIds)]
    if (topLevel) {
      const roots = await this.db.feature.findRootParentsOfMany(uniqueIds)
      return roots.filter(
        (root, i, arr) => arr.findIndex((r) => r._id === root._id) === i,
      )
    }
    return this.db.feature.findByIds(uniqueIds)
  }

  async findById(featureId: string, topLevel?: boolean) {
    const feature = await this.db.feature.findById(featureId)
    if (!feature) {
      throw new NotFoundException(`Feature not found: ${featureId}`)
    }
    if (topLevel && feature.parentId) {
      const rootFeature = await this.db.feature.findRootParent(featureId)
      if (rootFeature) {
        return rootFeature
      }
    }
    return feature
  }

  async findFeaturesByRange(searchDto: FeatureRangeSearchDto) {
    const roots = await this.db.feature.findRootsByRange(
      searchDto.refSeq,
      Number(searchDto.start),
      Number(searchDto.end),
    )
    if (roots.length === 0) {
      return []
    }
    const rootIds = roots.map((r) => r._id)
    const descendants = await this.db.feature.findDescendantsOfMany(rootIds)
    return assembleFeatureTrees([...roots, ...descendants])
  }

  async checkFeature(featureId: string, checkTimestamps = true) {
    return this.checksService.checkFeature(featureId, checkTimestamps)
  }

  async searchFeatures(searchDto: { term: string; assemblies: string }) {
    const { assemblies, term } = searchDto
    const assemblyIds = assemblies.split(',')
    const refSeqs = await this.db.refSeq.findByAssemblies(assemblyIds)
    const refSeqIds = refSeqs.map((rs) => rs._id)
    return this.db.feature.searchText(refSeqIds, term)
  }
}
