import {
  type FeatureRow,
  assembleFeatureTrees,
} from '@apollo-annotation/common'
import { Injectable, Logger, NotFoundException } from '@nestjs/common'

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
    private readonly checksService: ChecksService,
    private readonly db: DatabaseService,
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
      const match = await this.findIndexedIdInTree(id, rootFeature)
      if (match) {
        results.push(match)
      }
    }
    return results
  }

  async findIndexedIdInTree(
    id: string,
    feature: FeatureRow,
  ): Promise<FeatureRow | undefined> {
    if (feature.attributes) {
      for (const attributeValue of Object.values(feature.attributes)) {
        if (attributeValue.includes(id)) {
          return feature
        }
      }
    }
    const descendants = await this.db.feature.findDescendants(feature._id)
    for (const descendant of descendants) {
      if (descendant.attributes) {
        for (const attributeValue of Object.values(descendant.attributes)) {
          if (attributeValue.includes(id)) {
            return descendant
          }
        }
      }
    }
    return undefined
  }

  async findByFeatureIds(featureIds: string[], topLevel?: boolean) {
    const foundFeatures: FeatureRow[] = []
    const fetchedFeatureIds = new Set<string>()

    for (const featureId of featureIds) {
      if (fetchedFeatureIds.has(featureId)) {
        continue
      }

      try {
        const feature = await this.findById(featureId, topLevel)
        foundFeatures.push(feature)
        fetchedFeatureIds.add(featureId)
      } catch (error) {
        this.logger.error(
          `Error occurred while fetching feature ${featureId}`,
          error instanceof Error ? error.stack : String(error),
        )
      }
    }
    return foundFeatures
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

  async findByRange(searchDto: FeatureRangeSearchDto) {
    const roots = await this.db.feature.findRootsByRange(
      searchDto.refSeq,
      Number(searchDto.start),
      Number(searchDto.end),
    )
    let features: FeatureRow[] = []
    if (roots.length > 0) {
      const rootIds = roots.map((r) => r._id)
      const descendants =
        await this.db.feature.findDescendantsOfMany(rootIds)
      features = assembleFeatureTrees([...roots, ...descendants])
    }
    const checkResults = await this.checksService.findByRange(searchDto)
    return [features, checkResults]
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
