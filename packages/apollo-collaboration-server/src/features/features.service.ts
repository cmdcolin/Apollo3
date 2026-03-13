import type { FeatureRow } from '@apollo-annotation/common'
import { GetFeaturesOperation } from '@apollo-annotation/shared'
import { Injectable, Logger, NotFoundException } from '@nestjs/common'

import { ChecksService } from '../checks/checks.service.js'
import type { FeatureRangeSearchDto } from '../entity/gff3Object.dto.js'
import { DatabaseService } from '../mikro-orm/database.service.js'
import { OperationsService } from '../operations/operations.service.js'

import type {
  FeatureCountRequest,
  GetByIndexedIdRequest,
} from './dto/feature.dto.js'

@Injectable()
export class FeaturesService {
  constructor(
    private readonly operationsService: OperationsService,
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
      for (const refSeq of refSeqs) {
        count += await this.db.feature.countByRange(
          refSeq._id,
          start ?? 0,
          end ?? Number.MAX_SAFE_INTEGER,
        )
      }
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
        this.logger.debug(`FeatureId ${featureId} already fetched, skipping...`)
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
      const errMsg = `ERROR: The following featureId was not found in database ='${featureId}'`
      this.logger.error(errMsg)
      throw new NotFoundException(errMsg)
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
    this.logger.warn(
      `[DEBUG findByRange] refSeq=${searchDto.refSeq}, start=${searchDto.start}, end=${searchDto.end}`,
    )
    const featureDocs =
      await this.operationsService.executeOperation<GetFeaturesOperation>({
        typeName: 'GetFeaturesOperation',
        refSeq: searchDto.refSeq,
        start: searchDto.start,
        end: searchDto.end,
      })
    this.logger.warn(`[DEBUG findByRange] got ${featureDocs.length} features`)
    for (const featureDoc of featureDocs) {
      if (featureDoc._id) {
        this.logger.warn(
          `[DEBUG findByRange] checking feature ${String(featureDoc._id)}`,
        )
        await this.checksService.checkFeature(String(featureDoc._id), true)
      }
    }
    const checkResults = await this.checksService.findByRange(searchDto)
    this.logger.warn(
      `[DEBUG findByRange] returning ${featureDocs.length} features and ${checkResults.length} checkResults`,
    )
    return [featureDocs, checkResults]
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
