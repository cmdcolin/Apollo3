import { GetFeaturesOperation } from '@apollo-annotation/shared'
import { Injectable, Logger, NotFoundException } from '@nestjs/common'

import { ChecksService } from '../checks/checks.service'
import { FeatureRangeSearchDto } from '../entity/gff3Object.dto'
import { DatabaseService } from '../mikro-orm/database.service'
import { OperationsService } from '../operations/operations.service'

import { FeatureCountRequest } from './dto/feature.dto'

@Injectable()
export class FeaturesService {
  constructor(
    private readonly operationsService: OperationsService,
    private readonly checksService: ChecksService,
    private readonly db: DatabaseService,
  ) {}

  private readonly logger = new Logger(FeaturesService.name)

  async findAll() {
    const refSeqs = await this.db.refSeq.findAll()
    const features = []
    for (const refSeq of refSeqs) {
      const refFeatures = await this.db.feature.findByRange(
        refSeq._id,
        0,
        Number.MAX_SAFE_INTEGER,
      )
      for (const f of refFeatures) {
        features.push(f)
      }
    }
    return features
  }

  async getFeatureCount(featureCountRequest: FeatureCountRequest) {
    const { assemblyId, end, refSeqId, start } = featureCountRequest

    let count = 0
    if (refSeqId) {
      const features = await this.db.feature.findByRange(
        refSeqId,
        start ?? 0,
        end ?? Number.MAX_SAFE_INTEGER,
      )
      count = features.length
    } else if (assemblyId) {
      const refSeqs = await this.db.refSeq.findByAssembly(assemblyId)
      for (const refSeq of refSeqs) {
        const features = await this.db.feature.findByRange(
          refSeq._id,
          start ?? 0,
          end ?? Number.MAX_SAFE_INTEGER,
        )
        count += features.length
      }
    } else {
      const refSeqs = await this.db.refSeq.findAll()
      for (const refSeq of refSeqs) {
        const features = await this.db.feature.findByRange(
          refSeq._id,
          0,
          Number.MAX_SAFE_INTEGER,
        )
        count += features.length
      }
    }

    this.logger.debug(`Number of features is ${count}`)
    return count
  }

  async findById(featureId: string) {
    const feature = await this.db.feature.findById(featureId)
    if (!feature) {
      const errMsg = `ERROR: The following featureId was not found in database ='${featureId}'`
      this.logger.error(errMsg)
      throw new NotFoundException(errMsg)
    }
    return feature
  }

  async findByRange(searchDto: FeatureRangeSearchDto) {
    const featureDocs =
      await this.operationsService.executeOperation<GetFeaturesOperation>({
        typeName: 'GetFeaturesOperation',
        refSeq: searchDto.refSeq,
        start: searchDto.start,
        end: searchDto.end,
      })
    for (const featureDoc of featureDocs) {
      if (featureDoc._id) {
        await this.checksService.checkFeature(String(featureDoc._id), true)
      }
    }
    const checkResults = await this.checksService.findByRange(searchDto)
    return [featureDocs, checkResults]
  }

  async checkFeature(featureId: string, checkTimestamps = true) {
    return this.checksService.checkFeature(featureId, checkTimestamps)
  }

  async searchFeatures(searchDto: { term: string; assemblies: string }) {
    const { assemblies, term } = searchDto
    const assemblyIds = assemblies.split(',')
    const results = []
    for (const assemblyId of assemblyIds) {
      const refSeqs = await this.db.refSeq.findByAssembly(assemblyId)
      for (const refSeq of refSeqs) {
        const features = await this.db.feature.searchText(refSeq._id, term)
        for (const feature of features) {
          results.push(feature)
        }
      }
    }
    return results
  }
}
